import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { goldenFixtures } from '../fixtures/extraction-golden.ts';
import { csvCell, hash } from '../lib/domain.ts';
import { probeLocalOllama, type VerificationReport } from '../lib/verification.ts';
import type { Job, Draft, Profile } from '../lib/contracts.ts';

// Opt-in LIVE acceptance only. Native HTTP + real browser, no route mocks.
// A new synthetic-only database is allocated for each invocation; private data is never opened.
const evaluation = JSON.parse(readFileSync('artifacts/evaluation-latest.json', 'utf8'));
assert.equal(
  evaluation.status,
  'COMPLETE',
  'Complete the golden evaluation before live acceptance',
);
const gate = evaluation.gate as VerificationReport;
assert.equal(gate.status, 'PASS', 'Real verification must pass before acceptance');
assert.equal(gate.checks.httpStatus, 200);
assert.equal(gate.checks.evidenceValid, true);
assert.equal(
  evaluation.datasetHash,
  hash(JSON.stringify(goldenFixtures)),
  'Golden dataset changed',
);
assert.equal(
  evaluation.fixtures.find((r: { fixtureId: string }) => r.fixtureId === 'gold-01-explicit-skills')
    ?.adapterHash,
  hash(readFileSync('lib/ollama.ts', 'utf8')),
  'Evaluate the current adapter before acceptance',
);
const inventory = z
  .object({ models: z.array(z.object({ name: z.string(), digest: z.string() })).max(1000) })
  .safeParse(await probeLocalOllama('/api/tags'));
assert(inventory.success, 'Local model inventory is invalid');
assert.equal(
  inventory.data.models.find((m) => m.name === 'qwen3:4b')?.digest,
  gate.modelDigest,
  'Evaluation model digest changed',
);
const runId = Date.now().toString(),
  base = 'http://127.0.0.1:3210';
const database = resolve(`artifacts/acceptance-${runId}.sqlite`);
mkdirSync('artifacts', { recursive: true });
let server: ChildProcess | undefined,
  step = 'start',
  browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const report: Record<string, unknown> = {
  status: 'FAIL',
  recordedAt: new Date().toISOString(),
  model: gate.model,
  modelDigest: gate.modelDigest,
  fixtureId: 'gold-01-explicit-skills',
  runId,
  databaseFile: `artifacts/acceptance-${runId}.sqlite`,
};
async function state() {
  const r = await fetch(base + '/api/tracker');
  assert.equal(r.status, 200);
  return (await r.json()) as { jobs: Job[]; profile: Profile | null };
}
async function details(id: string) {
  const r = await fetch(base + '/api/tracker?id=' + id);
  assert.equal(r.status, 200);
  return (await r.json()) as { job: Job; drafts: Draft[] };
}
async function stop() {
  if (server && server.exitCode === null) {
    const stopped = new Promise<void>((r) => server!.once('exit', () => r()));
    server.kill();
    await stopped;
  }
  server = undefined;
}
async function start() {
  server = spawn(
    process.execPath,
    ['scripts/next.mjs', 'start', '--hostname', '127.0.0.1', '--port', '3210'],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, DATABASE_PATH: database, OLLAMA_BASE_URL: 'http://127.0.0.1:11434' },
    },
  );
  const owned = server;
  await new Promise<void>((ready, reject) => {
    const timer = setTimeout(() => finish(new Error('Acceptance server did not start')), 20000);
    let output = '';
    const onData = (data: Buffer) => {
      output = (output + data.toString()).slice(-4096);
      if (output.includes('Ready in')) finish();
    };
    const onExit = () => finish(new Error('Acceptance server exited before ready'));
    function finish(error?: Error) {
      clearTimeout(timer);
      owned.stdout?.off('data', onData);
      owned.off('exit', onExit);
      owned.off('error', finish);
      if (error) reject(error);
      else ready();
    }
    owned.stdout?.on('data', onData);
    owned.once('exit', onExit);
    owned.once('error', finish);
  });
  assert.equal((await fetch(base, { signal: AbortSignal.timeout(5000) })).status, 200);
}
try {
  await start();
  assert.equal((await state()).jobs.length, 0, 'Acceptance database must be empty');
  browser = await chromium.launch();
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.name));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Your next chapter starts here' }).waitFor();
  step = 'import';
  console.log('Live acceptance: importing a synthetic job');
  const fixture = goldenFixtures[0],
    company = 'Acceptance Synthetic Labs',
    position = 'Synthetic React Engineer';
  const header = [
    'company',
    'position',
    'location',
    'employmentType',
    'salary',
    'sourceUrl',
    'description',
    'synthetic',
  ];
  const csv =
    header.join(',') +
    '\n' +
    [
      company,
      position,
      'Remote',
      'Contract',
      '',
      'https://example.com/acceptance/' + runId,
      fixture.description,
      'true',
    ]
      .map(csvCell)
      .join(',');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page.getByLabel('Or paste CSV').fill(csv);
  await page.getByRole('button', { name: 'Validate & import', exact: true }).click();
  await page.getByRole('button', { name: position, exact: true }).click();
  step = 'real-extraction';
  console.log('Live acceptance: requesting genuine local inference');
  const extractionResponse = page.waitForResponse(
    (r) =>
      r.url() === base + '/api/tracker' &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === 'extract',
    { timeout: 310000 },
  );
  await page.getByRole('button', { name: 'Extract with Ollama', exact: true }).click();
  assert.equal((await extractionResponse).status(), 200);
  await expect(page.locator('.provenance')).toContainText('Actual local Ollama inference');
  const imported = (await state()).jobs[0],
    original = (await details(imported.id)).job.extraction!;
  assert.equal(original.provider, 'ollama');
  assert.equal(original.model, 'qwen3:4b');
  assert.equal(original.verification?.httpStatus, 200);
  assert.equal(original.verification?.doneReason, 'stop');
  assert.equal(original.verification?.evidenceValid, true);
  report.originalRequirementCount = original.requirements.length;
  report.inputHash = original.inputHash;
  step = 'human-review';
  console.log('Live acceptance: inspecting and correcting requirements');
  const reviewed = { requirements: fixture.requirements.map(({ id, aliases, ...r }) => r) };
  const originalDuty = original.requirements.find((r) => r.kind === 'responsibility');
  reviewed.requirements[3].term =
    originalDuty?.term === 'accessible dashboards'
      ? 'Build accessible dashboards'
      : 'accessible dashboards';
  report.humanReviewAction =
    'Normalized the literal responsibility label; preserved source evidence and original inference';
  await page.getByRole('button', { name: 'Review / enter requirements', exact: true }).click();
  // Review through the same labeled controls as a human; this never saves until
  // the explicit confirmation below. The original Ollama record stays retained.
  while (await page.getByRole('button', { name: /^Remove requirement \d+$/ }).count())
    await page
      .getByRole('button', { name: /^Remove requirement \d+$/ })
      .last()
      .click();
  for (const [index, requirement] of reviewed.requirements.entries()) {
    await page.getByRole('button', { name: 'Add requirement', exact: true }).click();
    const row = page.getByRole('group', { name: `Requirement ${index + 1}`, exact: true });
    await row.getByLabel('Requirement name').fill(requirement.term);
    await row.getByLabel('Kind', { exact: true }).selectOption(requirement.kind);
    await row.getByLabel('Priority', { exact: true }).selectOption(requirement.priority);
    await row.getByLabel('Exact job quote').fill(requirement.evidence);
    if (requirement.minYears !== null)
      await row.getByLabel('Minimum years (optional)').fill(String(requirement.minYears));
  }
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(page.getByText(/Original local Ollama inference retained/)).toBeVisible();
  const corrected = (await details(imported.id)).job.extraction!;
  assert.equal(corrected.provider, 'human');
  assert.deepEqual(corrected.originalInference?.requirements, original.requirements);
  assert.equal(corrected.originalInference?.verification?.evidenceValid, true);
  report.humanReviewChangedRequirements =
    hash(JSON.stringify(original.requirements)) !== hash(JSON.stringify(reviewed.requirements));
  step = 'profile-and-fit';
  console.log('Live acceptance: reviewing fictional résumé evidence and fit');
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Use synthetic résumé', exact: true }).click();
  await page.getByRole('button', { name: /Extract skill evidence/ }).click();
  await expect(page.getByLabel('Skill name', { exact: true }).first()).not.toHaveValue('');
  await page.getByLabel('I reviewed the evidence and confirm this profile is accurate.').check();
  await page.getByRole('button', { name: 'Save verified profile', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Verified profile saved locally' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Opportunities/ })
    .first()
    .click();
  await page.getByRole('button', { name: position, exact: true }).click();
  await page.getByRole('tab', { name: 'Fit comparison', exact: true }).click();
  await expect(page.getByText('7 of 7 weighted points', { exact: true })).toBeVisible();
  await expect(page.getByText('3 matched · 0 missing · 1 unknown', { exact: true })).toBeVisible();
  report.fitScore = 100;
  report.fitEarned = 7;
  report.fitPossible = 7;
  report.unknownRequirements = 1;
  step = 'status';
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Applied');
  await page.getByLabel('Application date', { exact: true }).fill('2026-11-15');
  await page
    .getByLabel('Private notes', { exact: true })
    .fill('Synthetic acceptance only. No application or email sent.');
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Application progress saved' }),
  ).toBeVisible();
  step = 'draft-review';
  console.log('Live acceptance: editing and explicitly approving the synthetic draft');
  await page.getByRole('tab', { name: 'Drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Create tailored draft', exact: true }).click();
  const note = page.getByLabel('Cover note', { exact: true });
  await expect(note).toHaveValue(/React/);
  const edited = (await note.inputValue()) + '\n\nThank you for reviewing my note.';
  await note.fill(edited);
  await page.getByRole('button', { name: 'Save edits as pending', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Draft edits saved as pending' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toBeDisabled();
  await page.getByLabel('I reviewed this draft and confirm every claim is accurate.').check();
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Copy approved draft', exact: true }),
  ).toBeEnabled();
  step = 'copy-and-export';
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  await page.getByRole('button', { name: 'Copy approved draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved draft copied' })).toBeVisible();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboardText.replace(/\r\n/g, '\n'), edited);
  report.clipboardLineEnding = clipboardText.includes('\r\n') ? 'CRLF' : 'LF';
  report.copiedDraftHash = hash(edited);
  await page.getByRole('button', { name: 'Back to opportunities', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  assert(stream);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = parse(Buffer.concat(chunks).toString('utf8'), {
    bom: true,
    columns: true,
  }) as Record<string, string>[];
  assert.equal(exported.length, 1);
  assert.equal(exported[0].status, 'Applied');
  assert.equal(exported[0].company, company);
  report.exportedRows = exported.length;
  assert.equal(pageErrors.length, 0);
  await browser.close();
  browser = undefined;
  step = 'restart-persistence';
  console.log('Live acceptance: restarting the application to verify persistence');
  await stop();
  await start();
  const persisted = await details(imported.id);
  assert.equal(persisted.job.status, 'Applied');
  assert.equal(persisted.job.extraction?.originalInference?.provider, 'ollama');
  assert.equal(persisted.job.extraction?.originalInference?.verification?.done, true);
  assert.equal(persisted.drafts[0].status, 'approved');
  assert.equal(hash(persisted.drafts[0].text), report.copiedDraftHash);
  assert.equal((await state()).profile?.verified, true);
  report.status = 'PASS';
  report.restartPersistence = true;
  report.originalProvider = 'ollama';
  report.currentProvider = 'human';
  report.applicationStatus = 'Applied';
  report.draftStatus = 'approved';
} catch (error) {
  report.failedStep = step;
  report.failureName = error instanceof Error ? error.name : 'unknown';
  // This script has only committed synthetic inputs; never use it for private records.
  console.error(
    error instanceof Error ? error.message.slice(0, 400) : 'Unknown acceptance failure',
  );
  console.error('Live acceptance failed at step: ' + step);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  writeFileSync('artifacts/live-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
