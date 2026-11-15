import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, closeDb } from '../lib/db.ts';
import * as store from '../lib/store.ts';
import { fixtures, syntheticResume } from '../fixtures/jobs.ts';
import { extractProfile, hash } from '../lib/domain.ts';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rolecraft-test-'));
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
});
afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  rmSync(dir, { recursive: true, force: true });
});
const extraction = {
  requirements: [
    {
      term: 'React',
      kind: 'skill' as const,
      priority: 'required' as const,
      evidence: 'Required skills: TypeScript, React.',
      minYears: null,
    },
  ],
  provider: 'human' as const,
  model: 'test-human',
  at: new Date().toISOString(),
  durationMs: 0,
  inputHash: hash(fixtures[0].description),
};
describe('SQLite migrations, transactions and lifecycle', () => {
  it('persists after reopening, blocks duplicates and retains near duplicates', () => {
    expect(store.importJobs(fixtures)).toEqual({ imported: 20, duplicates: 0 });
    expect(store.importJobs(fixtures)).toEqual({ imported: 0, duplicates: 20 });
    expect(store.listJobs().filter((j) => j.nearDuplicates.length)).toHaveLength(2);
    closeDb();
    expect(store.listJobs()).toHaveLength(20);
    expect(() => store.addJob(fixtures[0])).toThrow('duplicate');
  });
  it('rolls back the full import on storage-limit failure', () => {
    const j = store.addJob(fixtures[0]);
    db().exec(
      `CREATE TRIGGER fail_import BEFORE INSERT ON jobs WHEN NEW.company='Harbor Data' BEGIN SELECT RAISE(ABORT, 'storage test'); END;`,
    );
    expect(() => store.importJobs([fixtures[1], fixtures[2]])).toThrow();
    expect(store.listJobs().map((k) => k.id)).toEqual([j.id]);
  });
  it('retains review decisions and saves status, dates, notes and events', () => {
    const a = store.addJob(fixtures[0]),
      b = store.addJob(fixtures[19]);
    store.keepBoth(a.id, b.id);
    store.saveTracking(a.id, {
      status: 'Applied',
      appliedDate: '2026-11-15',
      followUpDate: '2026-11-20',
      notes: 'Local private note',
    });
    closeDb();
    expect(store.listJobs().every((j) => j.nearDuplicates.length === 0)).toBe(true);
    expect(store.getJob(a.id).status).toBe('Applied');
    expect(store.events(a.id)[0].detail).toContain('no application was sent');
    expect(() =>
      store.saveTracking(a.id, {
        status: 'Interview',
        appliedDate: '2026-02-30',
        followUpDate: '',
        notes: '',
      }),
    ).toThrow();
  });
  it('clears stale extraction on edits and blocks stale inference writes', () => {
    const j = store.addJob(fixtures[0]);
    store.saveExtraction(j.id, extraction, j.updatedAt);
    const current = store.getJob(j.id);
    store.updateJob(j.id, {
      ...fixtures[0],
      description: fixtures[0].description + ' Extra source information.',
    });
    expect(store.getJob(j.id).extraction).toBeNull();
    expect(() => store.saveExtraction(j.id, extraction, current.updatedAt)).toThrow('changed');
  });
  it('requires explicit approval, preserves approved text, marks context changes and cascades deletion', () => {
    const j = store.addJob(fixtures[0]);
    store.saveExtraction(j.id, extraction, j.updatedAt);
    const p = { ...extractProfile(syntheticResume), verified: true };
    store.saveProfile(p);
    store.createDraft(j.id);
    let d = store.getDrafts(j.id)[0];
    expect(d.status).toBe('pending');
    expect(d.text).toContain('React');
    expect(d.text).not.toContain('expert');
    expect(() => store.updateDraft(j.id, d.id, d.text, 'approved', false)).toThrow('Explicit');
    store.updateDraft(j.id, d.id, d.text, 'approved', true);
    closeDb();
    d = store.getDrafts(j.id)[0];
    expect(d.status).toBe('approved');
    expect(d.approvedAt).not.toBeNull();
    expect(() => store.updateDraft(j.id, d.id, d.text + ' changed', 'approved', true)).toThrow(
      'pending',
    );
    store.updateDraft(j.id, d.id, d.text + ' A human revision.', 'pending', false);
    const original = store.getDrafts(j.id).find((item) => item.id === d.id)!;
    expect(original.status).toBe('approved');
    expect(original.approvedAt).toBe(d.approvedAt);
    expect(original.text).toBe(d.text);
    expect(store.getDrafts(j.id)[0].status).toBe('pending');
    store.saveProfile({ ...p, skills: [] });
    expect(store.getDrafts(j.id)[0].stale).toBe(true);
    expect(store.getDrafts(j.id).find((item) => item.id === d.id)!.text).toBe(d.text);
    expect(() => store.updateDraft(j.id, d.id, d.text, 'approved', true)).toThrow();
    expect(store.events(j.id).some((e) => String(e.detail).includes('Profile review'))).toBe(true);
    store.deleteJob(j.id);
    expect(db().prepare('SELECT COUNT(*) AS n FROM drafts').get()!.n).toBe(0);
  });
  it('exports guarded CSV and erases profile and drafts without erasing jobs', () => {
    store.addJob({ ...fixtures[0], company: '=2+2' });
    store.saveProfile({ ...extractProfile(syntheticResume), verified: true });
    expect(store.exportCsv()).toContain('"\'=2+2"');
    store.clearProfile();
    expect(store.getProfile()).toBeNull();
    expect(store.listJobs()).toHaveLength(1);
  });
});
