import { fixtures, syntheticResume } from '../fixtures/jobs.ts';
import * as store from '../lib/store.ts';
import { closeDb } from '../lib/db.ts';
import { extractProfile, hash } from '../lib/domain.ts';
import type { JobInput, Requirement } from '../lib/contracts.ts';

// An explicit, synthetic-only local demo. Never replace an existing workspace.
if (store.listJobs().length || store.getProfile()) {
  console.error(
    'Demo setup requires an empty database. Use DATABASE_PATH=./data/demo.sqlite for a separate demo. Existing records were left untouched.',
  );
  closeDb();
  process.exit(1);
}
store.importJobs(fixtures);
const manual: JobInput = {
  company: 'Local Example Works',
  position: 'Local Tools Engineer',
  location: 'Remote · Global',
  employmentType: 'Contract',
  salary: 'Illustrative $90,000',
  sourceUrl: '',
  synthetic: true,
  description:
    'SYNTHETIC MANUAL EXAMPLE — not a real vacancy. Required skills: React, TypeScript. Preferred skills: Playwright. Build accessible, local-first software tools. Minimum 3 years of JavaScript experience required.',
};
store.addJob(manual);
const p = {
  ...extractProfile(syntheticResume),
  verified: true,
  experience: [
    {
      area: 'JavaScript',
      years: 4,
      evidence: 'I have 4 years of JavaScript experience building internal business tools.',
    },
  ],
};
store.saveProfile(p);
const jobs = store.listJobs();
for (const j of jobs) {
  const reqs: Requirement[] = [];
  for (const [kind, pattern] of [
    ['required', /Required skills: ([^\n]+?)\.(?:\n| |$)/],
    ['preferred', /Preferred skills: ([^\n]+?)\.(?:\n| |$)/],
  ] as const) {
    const m = j.description.match(pattern);
    if (m)
      for (const term of m[1].split(',').map((v) => v.trim()))
        reqs.push({ term, kind: 'skill', priority: kind, evidence: m[0], minYears: null });
  }
  // Explicitly HUMAN/demo rules, never Ollama or a live AI verification.
  if (reqs.length)
    store.saveExtraction(
      j.id,
      {
        requirements: reqs,
        provider: 'human',
        model: 'synthetic-demo-rules',
        at: new Date().toISOString(),
        durationMs: 0,
        inputHash: hash(j.description),
      },
      j.updatedAt,
    );
}
const at = '2026-11-15';
for (const [i, j] of jobs.entries()) {
  const status =
    i < 5 ? 'Applied' : i < 8 ? 'Interview' : i === 8 ? 'Offer' : i === 9 ? 'Rejected' : 'Saved';
  if (status !== 'Saved')
    store.saveTracking(j.id, {
      status,
      appliedDate: at,
      followUpDate: i < 3 ? '2026-11-18' : '',
      notes: 'Synthetic demonstration status only. No application or message was sent.',
    });
}
console.log(
  'Demo ready: 20 synthetic fixture jobs + 1 manual example, reviewed synthetic profile, human/demo requirements and example tracking. Real inference remains UNVERIFIED.',
);
closeDb();
