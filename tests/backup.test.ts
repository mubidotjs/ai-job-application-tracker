import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  createBackup,
  inspectBackup,
  restoreBackup,
  workspaceFingerprint,
  MAX_BACKUP_BYTES,
} from '../lib/backup-core.ts';
import { workspaceOperation } from '../lib/workspace-backup.ts';
import { startExtraction, startRestore, assertWorkspaceAvailable } from '../lib/workspace-state.ts';
import { db, closeDb } from '../lib/db.ts';
import * as store from '../lib/store.ts';
import { fixtures, syntheticResume } from '../fixtures/jobs.ts';
import { extractProfile, hash } from '../lib/domain.ts';

let folder: string, live: string, copy: string;
function raw() {
  return Object.fromEntries(
    ['migrations', 'jobs', 'profiles', 'drafts', 'events', 'duplicate_reviews'].map((t) => [
      t,
      db().prepare(`SELECT rowid AS _rowid_, * FROM ${t} ORDER BY rowid`).all(),
    ]),
  );
}
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'rolecraft-backup-test-'));
  live = join(folder, 'synthetic.sqlite');
  copy = join(folder, 'backup.sqlite');
  process.env.DATABASE_PATH = live;
  store.importJobs([fixtures[0], fixtures[19]]);
  const j = store.listJobs()[0];
  store.keepBoth(...(store.listJobs().map((job) => job.id) as [string, string]));
  store.saveProfile({ ...extractProfile(syntheticResume), verified: true });
  // Explicitly simulated provenance for a structural persistence regression, not live proof.
  store.saveExtraction(
    j.id,
    {
      requirements: [
        {
          term: 'React',
          kind: 'skill',
          priority: 'required',
          evidence: 'Required skills: TypeScript, React.',
          minYears: null,
        },
      ],
      provider: 'ollama',
      model: 'qwen3:4b',
      at: new Date().toISOString(),
      durationMs: 123,
      inputHash: hash(j.description),
    },
    j.updatedAt,
  );
  store.saveExtraction(
    j.id,
    { ...store.getJob(j.id).extraction!, provider: 'human', model: 'human-reviewed' },
    store.getJob(j.id).updatedAt,
  );
  store.saveTracking(j.id, {
    status: 'Interview',
    appliedDate: '2026-11-15',
    followUpDate: '2026-11-20',
    notes: 'Invented interview; nothing sent.',
  });
  store.createDraft(j.id);
  const draft = store.getDrafts(j.id)[0];
  store.updateDraft(j.id, draft.id, draft.text, 'approved', true);
});
afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  rmSync(folder, { recursive: true, force: true });
});
describe('synthetic-only SQLite-safe backup and atomic restore', () => {
  it('accepts the identical migration schema across Windows and Unix line endings', async () => {
    await createBackup(live, copy);
    const portable = new DatabaseSync(copy, { defensive: false });
    portable.exec(
      "PRAGMA writable_schema=ON; UPDATE sqlite_schema SET sql=replace(replace(sql,char(13),''),char(10),char(13)||char(10)) WHERE sql IS NOT NULL; PRAGMA writable_schema=OFF;",
    );
    portable.close();
    expect(inspectBackup(copy).schemaVersion).toBe(1);
    const before = raw();
    restoreBackup(live, copy, workspaceFingerprint(live));
    expect(raw()).toEqual(before);
  });
  it('round-trips exact rowids, identifiers, timestamps, approvals, history, reviewed provenance, tracking and migrations across restart', async () => {
    const before = raw();
    const job = store.listJobs()[0];
    const draft = store.getDrafts(job.id)[0];
    expect(db().prepare('PRAGMA journal_mode').get()!.journal_mode).toBe('wal');
    expect(statSync(live + '-wal').size).toBeGreaterThan(0);
    const info = await createBackup(live, copy);
    expect(info).toMatchObject({
      jobs: 2,
      approvedDrafts: 1,
      schemaVersion: 1,
      duplicateReviews: 1,
    });
    store.saveTracking(job.id, {
      status: 'Rejected',
      appliedDate: '2026-11-15',
      followUpDate: '',
      notes: 'Synthetic later state.',
    });
    store.clearProfile();
    store.addJob(fixtures[2]);
    restoreBackup(live, copy, workspaceFingerprint(live));
    closeDb();
    expect(raw()).toEqual(before);
    expect(store.getDrafts(job.id)[0]).toEqual(draft);
    expect(store.getJob(job.id).extraction?.originalInference?.provider).toBe('ollama');
    expect(store.getJob(job.id).status).toBe('Interview');
  });
  it('takes a consistent committed WAL snapshot during another connection’s writes', async () => {
    const j = store.listJobs()[0];
    db().exec('PRAGMA wal_autocheckpoint=0');
    // Enough pages for incremental backup, all invented bounded job text.
    for (let i = 0; i < 90; i++)
      store.addJob({
        ...fixtures[2],
        company: `Synthetic concurrency ${i}`,
        sourceUrl: '',
        description: 'SYNTHETIC example. '.repeat(600),
      });
    const writer = new DatabaseSync(live, { timeout: 3000 });
    const pending = createBackup(live, copy);
    await new Promise<void>((accept) =>
      setImmediate(() => {
        writer.exec('BEGIN IMMEDIATE');
        writer
          .prepare('UPDATE jobs SET status=?,notes=? WHERE id=?')
          .run('Offer', 'Atomic synthetic update', j.id);
        writer.exec('COMMIT');
        writer.close();
        accept();
      }),
    );
    await pending;
    const snap = new DatabaseSync(copy, { readOnly: true });
    const row = snap.prepare('SELECT status,notes FROM jobs WHERE id=?').get(j.id)!;
    expect([
      ['Interview', 'Invented interview; nothing sent.'],
      ['Offer', 'Atomic synthetic update'],
    ]).toContainEqual([row.status, row.notes]);
    expect(snap.prepare('SELECT COUNT(*) AS n FROM jobs').get()!.n).toBe(92);
    snap.close();
  });
  it('rejects corrupted, truncated and oversized files without changing any records', async () => {
    await createBackup(live, copy);
    const original = readFileSync(copy);
    const before = raw();
    for (const bytes of [
      Buffer.from('not SQLite'),
      original.subarray(0, 100),
      Buffer.alloc(MAX_BACKUP_BYTES + 1),
    ]) {
      writeFileSync(copy, bytes);
      expect(() => inspectBackup(copy)).toThrow();
    }
    const broken = Buffer.from(original);
    broken.fill(255, 100, 140);
    writeFileSync(copy, broken);
    expect(() => restoreBackup(live, copy, workspaceFingerprint(live))).toThrow();
    expect(raw()).toEqual(before);
  });
  it.each([
    'CREATE TRIGGER injected AFTER INSERT ON jobs BEGIN DELETE FROM profiles; END',
    'CREATE TABLE unexpected (data TEXT)',
    'UPDATE migrations SET version=2',
    "UPDATE profiles SET data='not json'",
    'DROP INDEX drafts_job',
    "PRAGMA foreign_keys=OFF; UPDATE drafts SET job_id='11111111-1111-4111-8111-111111111111'",
  ])('rejects incompatible schema/data safely: %s', async (sql) => {
    await createBackup(live, copy);
    const before = raw();
    const altered = new DatabaseSync(copy);
    altered.exec(sql);
    altered.close();
    expect(() => restoreBackup(live, copy, workspaceFingerprint(live))).toThrow();
    expect(raw()).toEqual(before);
  });
  it('preserves legacy accepted requirements without applying new semantic rules', async () => {
    const j = store.listJobs()[0],
      r = store.getJob(j.id).extraction!;
    r.requirements.push({
      term: 'AWS',
      kind: 'skill',
      priority: 'unknown',
      evidence: 'AWS is not required.',
      minYears: null,
    });
    db().prepare('UPDATE jobs SET extraction=? WHERE id=?').run(JSON.stringify(r), j.id);
    const before = raw();
    await createBackup(live, copy);
    restoreBackup(live, copy, workspaceFingerprint(live));
    expect(raw()).toEqual(before);
  });
  it('rejects a stale preview instead of silently discarding intervening changes', async () => {
    await createBackup(live, copy);
    const fingerprint = workspaceFingerprint(live);
    store.addJob(fixtures[2]);
    const before = raw();
    expect(() => restoreBackup(live, copy, fingerprint)).toThrow('changed after preview');
    expect(raw()).toEqual(before);
  });
  it('rolls back an interrupted transaction and recovers after abrupt process exit', async () => {
    await createBackup(live, copy);
    store.addJob(fixtures[2]);
    const before = raw();
    const fingerprint = workspaceFingerprint(live);
    expect(() =>
      restoreBackup(live, copy, fingerprint, () => {
        throw new Error('Synthetic interruption');
      }),
    ).toThrow('interruption');
    expect(raw()).toEqual(before);
    const module = pathToFileURL(join(process.cwd(), 'lib/backup-core.ts')).href;
    const script = `import {restoreBackup} from ${JSON.stringify(module)}; restoreBackup(${JSON.stringify(live)},${JSON.stringify(copy)},${JSON.stringify(fingerprint)},()=>process.exit(17));`;
    const child = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      { timeout: 10000, windowsHide: true },
    );
    expect(child.status).toBe(17);
    closeDb();
    expect(raw()).toEqual(before);
  });
  it('binds single-use confirmation to exact bytes and refuses overlapping extraction/restore', async () => {
    const backup = await workspaceOperation('backup');
    const bytes = backup.bytes!;
    const preview = await workspaceOperation('preview', bytes);
    await expect(workspaceOperation('restore', bytes)).rejects.toThrow('preview expired');
    await expect(
      workspaceOperation('restore', Buffer.from('different'), preview.token),
    ).rejects.toThrow('file changed');
    const finish = startExtraction();
    expect(() => startExtraction()).toThrow('already running');
    expect(() => startRestore()).toThrow('extraction to finish');
    finish();
    const release = startRestore();
    expect(() => assertWorkspaceAvailable()).toThrow('in progress');
    release();
    await workspaceOperation('restore', bytes, preview.token);
    await expect(workspaceOperation('restore', bytes, preview.token)).rejects.toThrow(
      'preview expired',
    );
  }, 20000);
  it('expires a preview without replacing data and refuses demo setup on an existing workspace', async () => {
    const before = raw();
    const backup = await workspaceOperation('backup');
    const preview = await workspaceOperation('preview', backup.bytes!);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    try {
      await expect(workspaceOperation('restore', backup.bytes!, preview.token)).rejects.toThrow(
        'preview expired',
      );
    } finally {
      clock.mockRestore();
    }
    const seed = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/demo.ts'], {
      env: { ...process.env, DATABASE_PATH: live },
      timeout: 10000,
      windowsHide: true,
    });
    expect(seed.status).toBe(1);
    expect(String(seed.stderr)).toContain('will not be opened');
    expect(raw()).toEqual(before);
  }, 20000);
});
