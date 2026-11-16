import 'server-only';
import { workspaceOperation } from '@/lib/workspace-backup';
import { MAX_BACKUP_BYTES } from '@/lib/backup-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function local(req: Request) {
  const host = req.headers.get('host') || '';
  if (
    !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
    req.headers.get('origin') !== `http://${host}`
  )
    throw new Error('Same-origin local access required.');
}
async function readFile(req: Request) {
  if (req.headers.get('content-type') !== 'application/octet-stream' || !req.body)
    throw new Error('Choose a Rolecraft SQLite backup file.');
  const declared = Number(req.headers.get('content-length') || 0);
  if (!Number.isFinite(declared) || declared > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds 32 MiB.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 32 MiB.');
      chunks.push(value);
    }
    if (timedOut)
      throw new Error('Backup file transfer timed out. Select the file and preview again.');
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    await reader.cancel();
  }
}
export async function POST(req: Request) {
  try {
    local(req);
    const action = new URL(req.url).searchParams.get('action');
    if (!['backup', 'preview', 'restore'].includes(action || ''))
      throw new Error('Unknown backup operation.');
    if (action === 'restore' && req.headers.get('x-rolecraft-confirm') !== 'replace-workspace')
      throw new Error('Explicit replacement confirmation is required.');
    const result = await workspaceOperation(
      action as 'backup' | 'preview' | 'restore',
      action === 'backup' ? undefined : await readFile(req),
      req.headers.get('x-rolecraft-preview') || undefined,
    );
    if ('bytes' in result && result.bytes)
      return new Response(new Uint8Array(result.bytes), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="rolecraft-workspace.sqlite"',
          'Cache-Control': 'no-store',
        },
      });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    const safe =
      /^(Same-origin local|Unknown backup|Explicit replacement|Choose a Rolecraft|Backup exceeds|Backup file transfer|Select a Rolecraft|Backup is corrupt|Restore preview|Workspace changed after preview|Workspace operation was interrupted|Another backup operation|Workspace restore is in progress|Wait for local extraction|A disk workspace)/.test(
        message,
      )
        ? message
        : 'Local workspace operation failed. Reload before retrying.';
    return Response.json(
      { error: safe },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
