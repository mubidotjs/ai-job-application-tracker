import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { audit } from '../audit.mjs';
import { jobs, profile, fixedExtraction } from '../dist/data.js';
import { matchProfile } from '../dist/matching.js';
test('Open Graph PNG has the declared 1200 × 630 viewport dimensions', () => {
  const og = readFileSync('dist/assets/og.png');
  assert(og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
});
test('deployable artifact is allowlisted static content with no server/storage/inference capabilities', () =>
  assert.equal(audit().status, 'PASS'));
test('contains exactly the unchanged invented fixtures, one invented manual example, and literal evidence', async () => {
  const { fixtures, syntheticResume } = await import('../../fixtures/jobs.ts');
  assert.equal(jobs.length, 21);
  assert.equal(profile.resume, syntheticResume);
  for (let i = 0; i < 20; i++)
    for (const field of [
      'company',
      'position',
      'location',
      'employmentType',
      'salary',
      'description',
      'synthetic',
    ])
      assert.equal(jobs[i][field], fixtures[i][field]);
  assert.equal(jobs[20].company, 'Local Example Works');
  for (const job of [...jobs, fixedExtraction])
    for (const r of job.requirements) {
      assert(job.description.includes(r.evidence));
      assert(r.evidence.includes(r.term));
    }
  for (const skill of profile.skills) assert(profile.resume.includes(skill.evidence));
});
test('ships the actual unchanged pure matching implementation, with a reproducible 3/7 comparison', () => {
  const source = stripTypeScriptTypes(readFileSync('../lib/matching.ts', 'utf8'), {
    mode: 'strip',
  }).replace("'./normalize.ts'", "'./normalize.js'");
  assert.equal(readFileSync('dist/matching.js', 'utf8'), source);
  const fit = matchProfile(profile, {
    requirements: jobs.find((j) => j.company === 'Atlas Grid').requirements,
  });
  assert.equal(fit.score, 43);
  assert.equal(fit.earned, 3);
  assert.equal(fit.possible, 7);
  assert.equal(fit.missing, 2);
});
test('artifact check rejects extra server files, runtime calls, uploads and SQLite payloads', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rolecraft-artifact-'));
  try {
    cpSync('dist', temp, { recursive: true });
    writeFileSync(join(temp, 'route.js'), 'server');
    assert.throws(() => audit(temp));
    rmSync(join(temp, 'route.js'));
    const original = readFileSync(join(temp, 'app.js'), 'utf8');
    for (const forbidden of [
      "fetch('/api/tracker')",
      'localStorage.setItem("x","y")',
      'new WebSocket("x")',
    ]) {
      writeFileSync(join(temp, 'app.js'), original + '\n' + forbidden);
      assert.throws(() => audit(temp));
    }
    writeFileSync(join(temp, 'app.js'), original);
    writeFileSync(join(temp, 'assets/og.png'), 'SQLite format 3\0');
    assert.throws(() => audit(temp));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
