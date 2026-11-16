import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { goldenFixtures, type GoldenFixture } from '../fixtures/extraction-golden.ts';
import { holdoutFixtures } from '../fixtures/extraction-holdout.ts';
import { extractionSchema } from '../lib/contracts.ts';
import { hash } from '../lib/domain.ts';
import { scoreExtraction } from '../lib/extraction-metrics.ts';
import { summarizeEvaluation } from '../lib/evaluation-summary.ts';
import { inferRequirements } from '../lib/ollama.ts';
import { probeLocalOllama } from '../lib/verification.ts';
import type { InferenceChecks } from '../lib/inference-errors.ts';

// Deliberately one fixed batch: no tuning, retries, extra verification inference,
// private database access, model downloads, or automatic changes to records.
const baselineCommit = 'fd1ccf62fd0ed1673a91a76e1759d1ac8105fc7f';
const baselinePath = 'docs/verification/evaluation-final.json';
const baselineText = readFileSync(baselinePath, 'utf8');
const baseline = JSON.parse(baselineText);
const expectedDigest = '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7';
const selected = [
  'gold-02-years-and-timezone',
  'gold-03-no-years',
  'gold-05-negation',
  'gold-06-conflict',
  'gold-08-constraints',
];
assert.equal(hash(JSON.stringify(goldenFixtures)), baseline.datasetHash, 'Frozen dataset changed');
assert.equal(baseline.gate.status, 'PASS');
assert.equal(baseline.gate.model, 'qwen3:4b');
assert.equal(baseline.gate.modelDigest, expectedDigest);
const version = z
  .object({ version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/) })
  .parse(await probeLocalOllama('/api/version'));
const inventory = z
  .object({ models: z.array(z.object({ name: z.string(), digest: z.string() })).max(1000) })
  .parse(await probeLocalOllama('/api/tags'));
assert.equal(
  inventory.models.find((m) => m.name === 'qwen3:4b')?.digest,
  expectedDigest,
  'Exact model digest must remain installed; no download/fallback',
);

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = `artifacts/quality-correction-${runId}.json`;
const snapshotRoot = resolve(`artifacts/baseline-adapter-${runId}`);
const baselineFiles = [
  'lib/ollama.ts',
  'lib/domain.ts',
  'lib/contracts.ts',
  'lib/inference-errors.ts',
  'lib/normalize.ts',
];
const candidateFiles = [
  ...baselineFiles,
  'lib/extraction-prompt.ts',
  'lib/requirement-evidence.ts',
];
const fileHashes = (files: string[]) =>
  Object.fromEntries([...files].sort().map((path) => [path, hash(readFileSync(path, 'utf8'))]));
const candidateSources = fileHashes(candidateFiles);
const adapterHash = hash(JSON.stringify(candidateSources));
const baselineSources: Record<string, string> = {};
for (const path of baselineFiles) {
  const source = execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${process.cwd().replace(/\\/g, '/')}`,
      'show',
      `${baselineCommit}:${path}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  baselineSources[path] = hash(source);
  const target = resolve(snapshotRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}
assert.equal(
  baselineSources['lib/ollama.ts'],
  baseline.fixtures.find((r: { fixtureId: string }) => r.fixtureId === 'gold-01-explicit-skills')
    .adapterHash,
  'Baseline adapter is not the verified source',
);
const oldAdapter = (await import(pathToFileURL(resolve(snapshotRoot, 'lib/ollama.ts')).href)) as {
  inferRequirements: typeof inferRequirements;
};
const oldAdapterHash = hash(
  JSON.stringify(
    Object.fromEntries(Object.entries(baselineSources).sort(([a], [b]) => a.localeCompare(b))),
  ),
);
const scorerHash = hash(readFileSync('lib/extraction-metrics.ts', 'utf8'));
assert.equal(
  scorerHash,
  hash(
    execFileSync(
      'git',
      [
        '-c',
        `safe.directory=${process.cwd().replace(/\\/g, '/')}`,
        'show',
        `${baselineCommit}:lib/extraction-metrics.ts`,
      ],
      { encoding: 'utf8' },
    ),
  ),
  'Scoring rules changed',
);
type Row = {
  fixtureId: string;
  status: string;
  failureCategory: string | null;
  durationMs: number;
  inputHash: string;
  adapterHash: string;
  adapterFileHash: string;
  adapterHashScheme: string;
  runId: string;
  model: string;
  modelDigest: string;
  retained: boolean;
  checks?: InferenceChecks;
  metrics: ReturnType<typeof scoreExtraction>;
  predictions?: { term: string; kind: string; priority: string; minYears: number | null }[];
};
const retained: Row[] = baseline.fixtures
  .filter((r: Row) => !selected.includes(r.fixtureId))
  .map((r: Row) => ({
    ...r,
    model: 'qwen3:4b',
    modelDigest: expectedDigest,
    retained: true,
    adapterHashScheme: 'legacy-single-file-sha256',
    adapterFileHash: r.adapterHash,
  }));
const originals: Row[] = [],
  oldHoldout: Row[] = [],
  newHoldout: Row[] = [];
const budget = selected.length + 2 * holdoutFixtures.length;
let calls = 0;
const context = {
  baselineCommit,
  baselinePath,
  baselineReportHash: hash(baselineText),
  model: 'qwen3:4b',
  modelDigest: expectedDigest,
  ollamaVersion: version.version,
  datasetHash: baseline.datasetHash,
  holdoutHash: hash(JSON.stringify(holdoutFixtures)),
  scorerHash,
  adapterHash,
  candidateSources,
  baselineAdapterHash: oldAdapterHash,
  baselineSources,
  runId,
  callBudget: budget,
};
function save(status: string) {
  const combined = [...retained, ...originals].sort((a, b) =>
    a.fixtureId.localeCompare(b.fixtureId),
  );
  const report = {
    formatVersion: 1,
    status,
    ...context,
    callsMade: calls,
    original: {
      evaluatedFixtureIds: originals.map((r) => r.fixtureId),
      retainedFixtureIds: retained.map((r) => r.fixtureId),
      acceptedFixtureCount: combined.filter((r) => r.status === 'PASS').length,
      totalFixtureCount: combined.length,
      summary: summarizeEvaluation(combined, goldenFixtures),
      fixtures: combined,
    },
    holdout: {
      baseline: {
        acceptedFixtureCount: oldHoldout.filter((r) => r.status === 'PASS').length,
        summary: summarizeEvaluation(oldHoldout, holdoutFixtures),
        fixtures: oldHoldout,
      },
      candidate: {
        acceptedFixtureCount: newHoldout.filter((r) => r.status === 'PASS').length,
        summary: summarizeEvaluation(newHoldout, holdoutFixtures),
        fixtures: newHoldout,
      },
    },
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  return report;
}
async function run(fixture: GoldenFixture, which: 'baseline' | 'candidate'): Promise<Row> {
  assert(calls < budget, 'Live call budget exhausted');
  assert.equal(
    hash(JSON.stringify(fileHashes(candidateFiles))),
    adapterHash,
    'Candidate changed during evaluation',
  );
  calls++;
  let candidate: unknown,
    status = 'PASS',
    failureCategory: string | null = null,
    checks: InferenceChecks | undefined;
  const start = Date.now();
  try {
    const result = await (which === 'baseline' ? oldAdapter.inferRequirements : inferRequirements)(
      fixture.description,
      fetch,
      (value) => {
        candidate = value;
      },
    );
    checks = result.verification;
  } catch (error) {
    failureCategory =
      error instanceof Error && 'category' in error && typeof error.category === 'string'
        ? error.category
        : 'unexpected';
    status = ['service_unavailable', 'timeout', 'model_missing'].includes(failureCategory)
      ? 'UNVERIFIED'
      : 'FAIL';
    if (error instanceof Error && 'checks' in error) checks = error.checks as InferenceChecks;
  }
  const parsed = extractionSchema.safeParse(candidate);
  const row: Row = {
    fixtureId: fixture.id,
    status,
    failureCategory,
    durationMs: Date.now() - start,
    inputHash: hash(fixture.description),
    adapterHash: which === 'baseline' ? oldAdapterHash : adapterHash,
    adapterFileHash:
      which === 'baseline' ? baselineSources['lib/ollama.ts'] : candidateSources['lib/ollama.ts'],
    adapterHashScheme: 'sorted-source-bundle-sha256-v1',
    runId,
    model: 'qwen3:4b',
    modelDigest: expectedDigest,
    retained: false,
    checks,
    metrics: scoreExtraction(fixture, candidate),
    predictions: parsed.success
      ? parsed.data.requirements.map(({ term, kind, priority, minYears }) => ({
          term,
          kind,
          priority,
          minYears,
        }))
      : undefined,
  };
  console.log(JSON.stringify({ phase: which, call: calls, budget, ...row }));
  return row;
}
save('RUNNING');
for (const fixture of goldenFixtures.filter((f) => selected.includes(f.id))) {
  originals.push(await run(fixture, 'candidate'));
  save('RUNNING');
}
for (const fixture of holdoutFixtures) {
  oldHoldout.push(await run(fixture, 'baseline'));
  save('RUNNING');
  newHoldout.push(await run(fixture, 'candidate'));
  save('RUNNING');
}
const report = save('COMPLETE');
const oldSummary = report.holdout.baseline.summary,
  newSummary = report.holdout.candidate.summary;
const rate = (r: { rate: number | null }) => r.rate;
const regressions: string[] = [];
if (report.holdout.candidate.acceptedFixtureCount < report.holdout.baseline.acceptedFixtureCount)
  regressions.push('acceptedFixtureCount');
for (const key of [
  'precision',
  'recall',
  'classificationCorrectness',
  'numericExperienceYearCorrectness',
  'noExperienceCorrectness',
] as const) {
  const a = rate(oldSummary[key]),
    b = rate(newSummary[key]);
  if (a !== null && (b === null || b + 1e-12 < a)) regressions.push(key);
}
if (newSummary.unsupportedClaimCount > oldSummary.unsupportedClaimCount)
  regressions.push('unsupportedClaimCount');
const final = {
  ...report,
  holdoutRegressions: regressions,
  holdoutNoRegression: regressions.length === 0,
  qualityTargetMet: report.original.acceptedFixtureCount >= 7 && regressions.length === 0,
  stopAfterThisBatch: true,
};
writeFileSync(output, JSON.stringify(final, null, 2) + '\n');
writeFileSync('artifacts/quality-correction-latest.json', JSON.stringify(final, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      report: output,
      originalAccepted: final.original.acceptedFixtureCount,
      original: final.original.summary,
      holdoutBaseline: oldSummary,
      holdoutCandidate: newSummary,
      holdoutNoRegression: final.holdoutNoRegression,
      qualityTargetMet: final.qualityTargetMet,
    },
    null,
    2,
  ),
);
