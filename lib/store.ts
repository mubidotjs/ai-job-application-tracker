import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import {
  canonicalKey,
  sourceKey,
  likelyDuplicate,
  hash,
  validateProfile,
  validateExtraction,
  csvCell,
} from './domain.ts';
import {
  jobInput,
  trackingSchema,
  type Job,
  type JobInput,
  type Profile,
  type Draft,
  type ExtractionRecord,
} from './contracts.ts';
import { matchProfile } from './matching.ts';

export class Conflict extends Error {}
type Row = Record<string, string | number | null>;
const now = () => new Date().toISOString();
function decode(row: Row): Job {
  return {
    id: String(row.id),
    company: String(row.company),
    position: String(row.position),
    location: String(row.location),
    employmentType: row.employment_type as Job['employmentType'],
    salary: String(row.salary),
    sourceUrl: String(row.source_url),
    description: String(row.description),
    synthetic: !!row.synthetic,
    status: row.status as Job['status'],
    appliedDate: String(row.applied_date),
    followUpDate: String(row.follow_up_date),
    notes: String(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    extraction: row.extraction ? JSON.parse(String(row.extraction)) : null,
    extractionError: row.extraction_error as string | null,
    nearDuplicates: [],
  };
}
export function listJobs(): Job[] {
  const jobs = (db().prepare('SELECT * FROM jobs ORDER BY created_at DESC, id').all() as Row[]).map(
    decode,
  );
  const reviewed = new Set(
    (db().prepare('SELECT pair_key FROM duplicate_reviews').all() as Row[]).map((r) =>
      String(r.pair_key),
    ),
  );
  for (const j of jobs)
    j.nearDuplicates = jobs
      .filter((k) => k.id !== j.id && likelyDuplicate(j, k) && !reviewed.has(pairKey(j.id, k.id)))
      .map((k) => ({ id: k.id, company: k.company, position: k.position }));
  return jobs;
}
export function getJob(id: string): Job {
  const row = db().prepare('SELECT * FROM jobs WHERE id=?').get(id) as Row | undefined;
  if (!row) throw new Error('Job not found');
  return decode(row);
}
function checkDuplicate(input: JobInput, except = '') {
  return db()
    .prepare(
      'SELECT id FROM jobs WHERE id<>? AND (canonical_key=? OR (source_key IS NOT NULL AND source_key=?))',
    )
    .get(except, canonicalKey(input), sourceKey(input.sourceUrl));
}
export function addJob(input: unknown) {
  const j = jobInput.parse(input);
  if (checkDuplicate(j))
    throw new Conflict(
      'Exact duplicate blocked: the same company, role and location, or canonical source URL, is already saved.',
    );
  if ((db().prepare('SELECT COUNT(*) AS n FROM jobs').get()!.n as number) >= 1000)
    throw new Error('Local limit: 1,000 jobs. Export and delete records before importing more.');
  const id = randomUUID(),
    at = now();
  db()
    .prepare(
      'INSERT INTO jobs(id,canonical_key,source_key,company,position,location,employment_type,salary,source_url,description,synthetic,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      canonicalKey(j),
      sourceKey(j.sourceUrl),
      j.company,
      j.position,
      j.location,
      j.employmentType,
      j.salary,
      j.sourceUrl,
      j.description,
      Number(j.synthetic),
      at,
      at,
    );
  return getJob(id);
}
export function importJobs(inputs: unknown[]) {
  const validated = inputs.map((i) => jobInput.parse(i));
  const result = { imported: 0, duplicates: 0 };
  db().exec('BEGIN IMMEDIATE');
  try {
    for (const j of validated) {
      if (checkDuplicate(j)) result.duplicates++;
      else {
        addJob(j);
        result.imported++;
      }
    }
    db().exec('COMMIT');
    return result;
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
}
function event(id: string, kind: string, detail: string) {
  db()
    .prepare('INSERT INTO events(job_id,kind,detail,created_at) VALUES(?,?,?,?)')
    .run(id, kind, detail, now());
  db()
    .prepare(
      'DELETE FROM events WHERE job_id=? AND id NOT IN (SELECT id FROM events WHERE job_id=? ORDER BY id DESC LIMIT 50)',
    )
    .run(id, id);
}
export function updateJob(id: string, input: unknown) {
  const old = getJob(id),
    j = jobInput.parse(input);
  if (checkDuplicate(j, id))
    throw new Conflict('Edit would create an exact duplicate; no changes saved.');
  const changed = old.description !== j.description;
  db()
    .prepare(
      'UPDATE jobs SET canonical_key=?,source_key=?,company=?,position=?,location=?,employment_type=?,salary=?,source_url=?,description=?,synthetic=?,updated_at=?,extraction=?,extraction_error=NULL WHERE id=?',
    )
    .run(
      canonicalKey(j),
      sourceKey(j.sourceUrl),
      j.company,
      j.position,
      j.location,
      j.employmentType,
      j.salary,
      j.sourceUrl,
      j.description,
      Number(j.synthetic),
      now(),
      changed ? null : old.extraction ? JSON.stringify(old.extraction) : null,
      id,
    );
  if (changed)
    event(
      id,
      'requirements',
      'Description changed: previous extraction and score cleared. Drafts retain their approval history but need context review.',
    );
  return getJob(id);
}
export function saveTracking(id: string, input: unknown) {
  const old = getJob(id),
    t = trackingSchema.parse(input);
  db()
    .prepare(
      'UPDATE jobs SET status=?,applied_date=?,follow_up_date=?,notes=?,updated_at=? WHERE id=?',
    )
    .run(t.status, t.appliedDate, t.followUpDate, t.notes, now(), id);
  if (old.status !== t.status)
    event(id, 'status', `${old.status} → ${t.status}. Changed manually; no application was sent.`);
}
export function deleteJob(id: string) {
  getJob(id);
  db().prepare('DELETE FROM jobs WHERE id=?').run(id);
}
export function getProfile(): Profile | null {
  const row = db().prepare('SELECT data FROM profiles WHERE id=1').get();
  return row ? JSON.parse(String(row.data)) : null;
}
export function saveProfile(input: unknown) {
  const p = validateProfile(input),
    old = getProfile();
  db().exec('BEGIN IMMEDIATE');
  try {
    db()
      .prepare(
        'INSERT INTO profiles(id,data,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
      )
      .run(JSON.stringify(p), now());
    for (const job of listJobs()) {
      const before = matchProfile(old, job.extraction),
        after = matchProfile(p, job.extraction);
      if (before?.score !== after?.score)
        event(
          job.id,
          'score',
          `Profile review changed fit from ${before?.score ?? 'unscored'} to ${after?.score ?? 'unscored'}. Matched points ${after?.earned ?? 0}/${after?.possible ?? 0}.`,
        );
    }
    db().exec('COMMIT');
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
  return p;
}
export function clearProfile() {
  db().exec('BEGIN IMMEDIATE');
  try {
    db().prepare('DELETE FROM profiles').run();
    db().prepare('DELETE FROM drafts').run();
    db().exec('COMMIT');
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
}
export function saveExtraction(id: string, record: ExtractionRecord, expectedUpdatedAt: string) {
  const job = getJob(id);
  if (job.updatedAt !== expectedUpdatedAt || hash(job.description) !== record.inputHash)
    throw new Conflict('Job changed during extraction. Run it again on the current description.');
  validateExtraction({ requirements: record.requirements }, job.description);
  const profile = getProfile(),
    before = matchProfile(profile, job.extraction),
    after = matchProfile(profile, record);
  db()
    .prepare('UPDATE jobs SET extraction=?,extraction_error=NULL,updated_at=? WHERE id=?')
    .run(JSON.stringify(record), now(), id);
  event(
    id,
    'score',
    `${record.provider === 'ollama' ? 'Local Ollama extraction' : 'Human requirement correction'}: fit ${before?.score ?? 'unscored'} → ${after?.score ?? 'unscored'}. ${after?.earned ?? 0}/${after?.possible ?? 0} weighted points.`,
  );
}
export function extractionFailed(id: string, message: string) {
  db().prepare('UPDATE jobs SET extraction_error=? WHERE id=?').run(message.slice(0, 500), id);
}
function contextHash(job: Job, profile: Profile | null) {
  return hash(
    JSON.stringify({
      company: job.company,
      position: job.position,
      description: job.description,
      extraction: job.extraction,
      profile,
    }),
  );
}
export function getDrafts(id: string): Draft[] {
  const job = getJob(id),
    current = contextHash(job, getProfile());
  return (
    db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY created_at DESC, rowid DESC').all(id) as Row[]
  ).map((r) => ({
    id: String(r.id),
    jobId: id,
    text: String(r.text),
    status: r.status as Draft['status'],
    createdAt: String(r.created_at),
    approvedAt: r.approved_at as string | null,
    evidence: JSON.parse(String(r.evidence)),
    stale: r.context_hash !== current,
  }));
}
export function createDraft(id: string) {
  const job = getJob(id),
    p = getProfile(),
    match = matchProfile(p, job.extraction);
  const supported =
    match?.rows.filter((r) => r.result === 'matched' && ['skill', 'technology'].includes(r.kind)) ??
    [];
  if (!p?.verified || !supported.length)
    throw new Error(
      'Review your profile and extract requirements with at least one evidenced skill match first.',
    );
  if ((db().prepare('SELECT COUNT(*) AS n FROM drafts WHERE job_id=?').get(id)!.n as number) >= 20)
    throw new Error('Draft limit: 20 per job');
  const names = supported
    .slice(0, 4)
    .map((r) => r.term)
    .join(', ');
  const text = `Hello ${job.company} team,\n\nI am interested in the ${job.position} role. My résumé includes experience with ${names}, which overlap with the requirements in your description. I would welcome the opportunity to discuss how that experience could contribute to your team.\n\nThank you for your consideration.`;
  db()
    .prepare(
      'INSERT INTO drafts(id,job_id,text,status,evidence,context_hash,created_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      randomUUID(),
      id,
      text,
      'pending',
      JSON.stringify(supported.slice(0, 4).map((r) => r.profileEvidence)),
      contextHash(job, p),
      now(),
    );
}
export function updateDraft(
  jobId: string,
  id: string,
  text: string,
  status: Draft['status'],
  approved: boolean,
) {
  const draft = getDrafts(jobId).find((d) => d.id === id);
  if (!draft) throw new Error('Draft not found');
  if (status === 'approved' && (!approved || draft.stale))
    throw new Error(
      'Explicit approval of the current context is required. Generate a new draft after source changes.',
    );
  if (draft.status === 'approved' && status === 'approved' && draft.text !== text)
    throw new Error('Save edits as pending, then explicitly approve the revised draft.');
  if (draft.status === 'approved' || draft.status === 'rejected') {
    if (draft.status === status && draft.text === text) return;
    if (
      (db().prepare('SELECT COUNT(*) AS n FROM drafts WHERE job_id=?').get(jobId)!.n as number) >=
      20
    )
      throw new Error('Draft limit: 20 per job');
    // Finalized decisions are immutable. A revision keeps the original evidence
    // fingerprint so stale sources cannot become approvable just by editing text.
    db()
      .prepare(
        `INSERT INTO drafts(id,job_id,text,status,evidence,context_hash,created_at,approved_at)
      SELECT ?,job_id,?,?,evidence,context_hash,?,NULL FROM drafts WHERE id=? AND job_id=?`,
      )
      .run(randomUUID(), text, status, now(), id, jobId);
    return;
  }
  db()
    .prepare('UPDATE drafts SET text=?,status=?,approved_at=? WHERE id=? AND job_id=?')
    .run(text, status, status === 'approved' ? now() : null, id, jobId);
}
export function events(id: string) {
  getJob(id);
  return db()
    .prepare(
      'SELECT kind,detail,created_at AS createdAt FROM events WHERE job_id=? ORDER BY id DESC LIMIT 50',
    )
    .all(id);
}
const pairKey = (a: string, b: string) => [a, b].sort().join(':');
export function keepBoth(a: string, b: string) {
  getJob(a);
  getJob(b);
  db().prepare('INSERT OR IGNORE INTO duplicate_reviews VALUES(?,?)').run(pairKey(a, b), now());
}
export function exportCsv() {
  const columns = [
    'company',
    'position',
    'location',
    'employmentType',
    'salary',
    'sourceUrl',
    'status',
    'appliedDate',
    'followUpDate',
    'notes',
    'synthetic',
  ] as const;
  return (
    '\uFEFF' +
    [
      columns.map(csvCell).join(','),
      ...listJobs().map((j) => columns.map((c) => csvCell(j[c])).join(',')),
    ].join('\r\n')
  );
}
