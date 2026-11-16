import { execFile } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { db } from './db.ts';
import { MAX_BACKUP_BYTES, type inspectBackup } from './backup-core.ts';
import { startRestore, assertWorkspaceAvailable } from './workspace-state.ts';

type Ticket = { fileHash: string; fingerprint: string; expires: number };
const tickets = new Map<string, Ticket>();
let busy = false;
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export async function workspaceOperation(
  action: 'backup' | 'preview' | 'restore',
  bytes?: Buffer,
  token?: string,
) {
  assertWorkspaceAvailable();
  if (busy) throw new Error('Another backup operation is running. Please wait.');
  busy = true;
  let folder: string | undefined;
  let unlock: (() => void) | undefined;
  try {
    for (const [key, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(key);
    const workspace = db().location(); // Only server-configured workspace, never a browser-supplied path.
    if (!workspace) throw new Error('A disk workspace is required for backup and restore.');
    if (action !== 'backup' && (!bytes?.length || bytes.length > MAX_BACKUP_BYTES))
      throw new Error('Select a Rolecraft backup no larger than 32 MiB.');
    let ticket: Ticket | undefined;
    if (action === 'restore') {
      ticket = token ? tickets.get(token) : undefined;
      if (!ticket || ticket.fileHash !== sha(bytes!))
        throw new Error('Restore preview expired or the selected file changed. Preview it again.');
      tickets.delete(token!); // One-use confirmation; failed restores require a fresh preview.
      unlock = startRestore();
    }
    folder = mkdtempSync(join(tmpdir(), 'rolecraft-backup-'));
    const candidate = join(folder, 'workspace.sqlite');
    if (bytes) writeFileSync(candidate, bytes, { mode: 0o600, flag: 'wx' });
    const result = await worker(
      action === 'preview' ? 'inspect' : action,
      workspace,
      candidate,
      ticket?.fingerprint,
    );
    if (action === 'backup') return { bytes: readFileSync(candidate) };
    if (action === 'preview') {
      if (typeof result.currentFingerprint !== 'string' || !result.backup)
        throw new Error('Workspace operation was interrupted. Reload before retrying.');
      if (tickets.size >= 4) tickets.delete(tickets.keys().next().value!);
      const key = randomUUID();
      tickets.set(key, {
        fileHash: sha(bytes!),
        fingerprint: result.currentFingerprint,
        expires: Date.now() + 5 * 60_000,
      });
      return { token: key, backup: result.backup };
    }
    tickets.clear();
    return { restored: result };
  } finally {
    unlock?.();
    busy = false;
    if (
      folder &&
      resolve(folder).startsWith(resolve(tmpdir()) + sep) &&
      join(folder, '..') !== folder
    )
      rmSync(folder, { recursive: true, force: true });
  }
}
function worker(
  action: string,
  workspace: string,
  candidate: string,
  fingerprint = '',
): Promise<{
  currentFingerprint?: string;
  backup?: ReturnType<typeof inspectBackup>;
  [key: string]: unknown;
}> {
  return new Promise((accept, reject) => {
    execFile(
      process.execPath,
      [
        '--experimental-strip-types',
        '--max-old-space-size=192',
        resolve('scripts/workspace-worker.ts'),
        action,
        workspace,
        candidate,
        fingerprint,
      ],
      {
        timeout: 25000,
        maxBuffer: 16000,
        windowsHide: true,
        env: { ...process.env, NODE_OPTIONS: '' },
      },
      (error, stdout) => {
        try {
          const result = JSON.parse(stdout);
          if (result.error) return reject(new Error(result.error));
          if (!error) return accept(result);
        } catch {
          /* No subprocess diagnostics are disclosed. */
        }
        reject(
          new Error(
            'Workspace operation was interrupted. Reload to check the workspace before retrying.',
          ),
        );
      },
    );
  });
}
