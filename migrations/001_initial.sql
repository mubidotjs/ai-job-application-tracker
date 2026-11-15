CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, canonical_key TEXT NOT NULL UNIQUE, source_key TEXT UNIQUE,
 company TEXT NOT NULL, position TEXT NOT NULL, location TEXT NOT NULL,
 employment_type TEXT NOT NULL, salary TEXT NOT NULL, source_url TEXT NOT NULL,
 description TEXT NOT NULL, synthetic INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'Saved' CHECK(status IN ('Saved','Applied','Interview','Offer','Rejected')),
 applied_date TEXT NOT NULL DEFAULT '', follow_up_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 extraction TEXT, extraction_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
 evidence TEXT NOT NULL, context_hash TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT
);
CREATE INDEX IF NOT EXISTS drafts_job ON drafts(job_id, created_at);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS duplicate_reviews (
 pair_key TEXT PRIMARY KEY, created_at TEXT NOT NULL
);
