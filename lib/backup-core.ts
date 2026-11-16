import { backup, DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { jobInput, profileSchema, trackingSchema, extractionSchema } from './contracts.ts';

export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const tables = ['migrations', 'jobs', 'profiles', 'drafts', 'events', 'duplicate_reviews'] as const;
type Table = (typeof tables)[number];
type Row = Record<string, string | number | null>;
type Snapshot = Record<Table, Row[]>;
const caps: Record<Table, number> = {
  migrations: 1,
  jobs: 1000,
  profiles: 1,
  drafts: 20000,
  events: 50000,
  duplicate_reviews: 499500,
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const fail = () => {
  throw new Error(
    'Backup is corrupt, incompatible, or exceeds workspace limits. Current data was not replaced.',
  );
};
const stamp = z.iso.datetime();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
let schema: string | undefined;
const schemaRows = (db: DatabaseSync) =>
  JSON.stringify(
    db
      .prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
      .all()
      .map((row) => ({
        ...row,
        sql: typeof row.sql === 'string' ? row.sql.replace(/\r\n/g, '\n') : row.sql,
      })),
  );
function expectedSchema() {
  if (!schema) {
    const reference = new DatabaseSync(':memory:');
    try {
      reference.exec(
        'CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
      );
      reference.exec(readFileSync(resolve('migrations/001_initial.sql'), 'utf8'));
      schema = schemaRows(reference);
    } finally {
      reference.close();
    }
  }
  return schema;
}
function connect(path: string, readOnly: boolean) {
  const db = new DatabaseSync(path, {
    readOnly,
    allowExtension: false,
    timeout: 3000,
    defensive: true,
    limits: { length: 2 * 1024 * 1024, sqlLength: 20000, column: 64, attach: 0 },
  });
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA hard_heap_limit=67108864;');
  return db;
}
function record(input: unknown, original = false): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const r = input as Record<string, unknown>;
  extractionSchema.parse({ requirements: r.requirements }); // Structural checks only: no semantic re-extraction/repair.
  z.enum(original ? ['ollama'] : ['human', 'ollama']).parse(r.provider);
  z.string().min(1).max(160).parse(r.model);
  stamp.parse(r.at);
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(r.durationMs);
  sha.parse(r.inputHash);
  if (r.verification !== undefined)
    z.object({
      httpStatus: z.number().nullable(),
      responseModel: z.string().max(160).nullable(),
      done: z.boolean().nullable(),
      doneReason: z.string().max(160).nullable(),
      schemaValid: z.boolean().nullable(),
      evidenceValid: z.boolean().nullable(),
    }).parse(r.verification);
  if (r.originalInference !== undefined) {
    if (original) fail();
    record(r.originalInference, true);
  }
}
function checkRows(s: Snapshot) {
  if (s.migrations.length !== 1 || s.migrations[0].version !== 1) fail();
  stamp.parse(s.migrations[0].applied_at);
  const ids = new Set<string>();
  for (const j of s.jobs) {
    z.uuid().parse(j.id);
    ids.add(String(j.id));
    jobInput.parse({
      company: j.company,
      position: j.position,
      location: j.location,
      employmentType: j.employment_type,
      salary: j.salary,
      sourceUrl: j.source_url,
      description: j.description,
      synthetic: j.synthetic === 1,
    });
    if (j.synthetic !== 0 && j.synthetic !== 1) fail();
    trackingSchema.parse({
      status: j.status,
      appliedDate: j.applied_date,
      followUpDate: j.follow_up_date,
      notes: j.notes,
    });
    stamp.parse(j.created_at);
    stamp.parse(j.updated_at);
    sha.parse(j.canonical_key);
    if (j.extraction !== null) record(JSON.parse(String(j.extraction)));
    if (j.extraction_error !== null) z.string().max(500).parse(j.extraction_error);
  }
  for (const p of s.profiles) {
    if (p.id !== 1) fail();
    profileSchema.parse(JSON.parse(String(p.data)));
    stamp.parse(p.updated_at);
  }
  for (const d of s.drafts) {
    z.uuid().parse(d.id);
    if (!ids.has(String(d.job_id))) fail();
    z.string().min(20).max(5000).parse(d.text);
    z.enum(['pending', 'approved', 'rejected']).parse(d.status);
    z.array(z.string().max(1000))
      .max(24)
      .parse(JSON.parse(String(d.evidence)));
    sha.parse(d.context_hash);
    stamp.parse(d.created_at);
    if (d.approved_at !== null) stamp.parse(d.approved_at);
    if (d.status === 'approved' && d.approved_at === null) fail();
  }
  for (const e of s.events) {
    z.number().int().positive().safe().parse(e.id);
    if (!ids.has(String(e.job_id))) fail();
    z.string().max(160).parse(e.kind);
    z.string().max(2000).parse(e.detail);
    stamp.parse(e.created_at);
  }
  for (const p of s.duplicate_reviews) {
    const pair = String(p.pair_key).split(':');
    if (pair.length !== 2 || pair[0] >= pair[1] || pair.some((id) => !ids.has(id))) fail();
    stamp.parse(p.created_at);
  }
  for (const name of ['drafts', 'events'] as const) {
    const counts = new Map<string, number>();
    for (const row of s[name]) {
      const id = String(row.job_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    if ([...counts.values()].some((n) => n > (name === 'drafts' ? 20 : 50))) fail();
  }
}
function snapshot(db: DatabaseSync): Snapshot {
  // Reject executable/extra schema objects BEFORE reading user tables or running integrity checks.
  if (schemaRows(db) !== expectedSchema()) fail();
  if (
    JSON.stringify(db.prepare('PRAGMA integrity_check(1)').all()) !==
      '[{"integrity_check":"ok"}]' ||
    db.prepare('PRAGMA foreign_key_check').all().length
  )
    fail();
  const result = {} as Snapshot;
  for (const table of tables) {
    const rows = db
      .prepare(`SELECT rowid AS _rowid_, * FROM ${table} ORDER BY rowid LIMIT ${caps[table] + 1}`)
      .all();
    if (
      rows.length > caps[table] ||
      rows.some((r) =>
        Object.values(r).some(
          (v) =>
            v !== null &&
            typeof v !== 'string' &&
            (typeof v !== 'number' || !Number.isSafeInteger(v)),
        ),
      )
    )
      fail();
    result[table] = rows as Row[];
  }
  checkRows(result);
  return result;
}
function summary(s: Snapshot) {
  return {
    jobs: s.jobs.length,
    profiles: s.profiles.length,
    drafts: s.drafts.length,
    approvedDrafts: s.drafts.filter((d) => d.status === 'approved').length,
    history: s.events.length,
    duplicateReviews: s.duplicate_reviews.length,
    schemaVersion: 1,
  };
}
export function inspectBackup(path: string) {
  const size = statSync(path).size;
  if (
    size < 512 ||
    size > MAX_BACKUP_BYTES ||
    !readFileSync(path).subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))
  )
    fail();
  const db = connect(path, true);
  try {
    const s = snapshot(db);
    return { ...summary(s), fingerprint: digest(JSON.stringify(s)), bytes: size };
  } finally {
    db.close();
  }
}
export async function createBackup(source: string, target: string) {
  const db = connect(source, true);
  try {
    if (
      Number(db.prepare('PRAGMA page_count').get()!.page_count) *
        Number(db.prepare('PRAGMA page_size').get()!.page_size) >
      MAX_BACKUP_BYTES
    )
      fail();
    await backup(db, target, { rate: 64 });
  } finally {
    db.close();
  }
  return inspectBackup(target);
}
export function workspaceFingerprint(path: string) {
  const db = connect(path, true);
  try {
    db.exec('BEGIN');
    return digest(JSON.stringify(snapshot(db)));
  } finally {
    db.close();
  }
}
export function restoreBackup(
  workspace: string,
  candidate: string,
  expected: string,
  beforeCommit?: () => void,
) {
  inspectBackup(candidate);
  const input = connect(candidate, true);
  let s: Snapshot;
  try {
    input.exec('BEGIN');
    s = snapshot(input);
  } finally {
    input.close();
  }
  const live = connect(workspace, false);
  try {
    live.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
    if (digest(JSON.stringify(snapshot(live))) !== expected)
      throw new Error(
        'Workspace changed after preview. Preview the backup again before replacing data.',
      );
    for (const table of [...tables].reverse()) live.exec(`DELETE FROM ${table}`);
    for (const table of tables) {
      for (const row of s[table]) {
        const columns = Object.keys(row);
        // Column names originate in the exact, trusted schema; values never become SQL.
        const statement = live.prepare(
          `INSERT INTO ${table} (${columns.map((c) => (c === '_rowid_' ? 'rowid' : c)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        );
        statement.run(...(Object.values(row) as SQLInputValue[]));
      }
    }
    if (digest(JSON.stringify(snapshot(live))) !== digest(JSON.stringify(s))) fail();
    beforeCommit?.();
    live.exec('COMMIT');
    return summary(s);
  } catch (e) {
    if (live.isTransaction) live.exec('ROLLBACK');
    throw e;
  } finally {
    live.close();
  }
}
