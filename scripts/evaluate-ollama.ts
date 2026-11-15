import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { goldenFixtures } from '../fixtures/extraction-golden.ts';
import { hash } from '../lib/domain.ts';
import { inferRequirements } from '../lib/ollama.ts';
import { InferenceError } from '../lib/inference-errors.ts';
import { scoreExtraction } from '../lib/extraction-metrics.ts';
import { verifyLocalOllama } from '../lib/verification.ts';

// This entrypoint always uses native fetch. It never reads the private database.
const gate = await verifyLocalOllama();
if (gate.status !== 'PASS') {
  console.log(JSON.stringify({ status: 'GATE_BLOCKED', gate }, null, 2));
  process.exit(1);
}
const selected = process.argv
  .find((v) => v.startsWith('--fixtures='))
  ?.slice('--fixtures='.length)
  .split(',');
if (selected?.some((id) => !goldenFixtures.some((f) => f.id === id)))
  throw new Error('Unknown fixture ID');
const datasetHash = hash(JSON.stringify(goldenFixtures));
const adapterHash = hash(readFileSync('lib/ollama.ts', 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
type Row = {
  fixtureId: string;
  inputHash: string;
  adapterHash: string;
  runId: string;
  status: string;
  failureCategory: string | null;
  durationMs: number;
  metrics: ReturnType<typeof scoreExtraction>;
};
let retained: Row[] = [];
const target = 'artifacts/evaluation-latest.json';
if (selected && existsSync(target)) {
  const previous = JSON.parse(readFileSync(target, 'utf8'));
  if (previous.datasetHash !== datasetHash || previous.gate.modelDigest !== gate.modelDigest)
    throw new Error('Cannot merge evaluations with a different dataset or model digest');
  retained = previous.fixtures.filter((r: Row) => !selected.includes(r.fixtureId));
}
const rows: Row[] = [...retained];
for (const fixture of goldenFixtures.filter((f) => !selected || selected.includes(f.id))) {
  let candidate: unknown,
    status = 'PASS',
    failureCategory: string | null = null;
  const start = Date.now();
  try {
    await inferRequirements(fixture.description, fetch, (value) => {
      candidate = value;
    });
  } catch (e) {
    status =
      e instanceof InferenceError && ['timeout', 'service_unavailable'].includes(e.category)
        ? 'UNVERIFIED'
        : 'FAIL';
    failureCategory = e instanceof InferenceError ? e.category : 'unexpected';
  }
  const row: Row = {
    fixtureId: fixture.id,
    inputHash: hash(fixture.description),
    adapterHash,
    runId,
    status,
    failureCategory,
    durationMs: Date.now() - start,
    metrics: scoreExtraction(fixture, candidate),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
rows.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
const valid = rows.map((r) => r.metrics).filter((m) => m.schemaValid);
const sum = (
  key:
    | 'candidateCount'
    | 'truePositives'
    | 'falsePositives'
    | 'exactSupported'
    | 'unsupportedClaims'
    | 'priorityCorrect'
    | 'priorityCompared'
    | 'yearsCorrect'
    | 'expectedYears'
    | 'unexpectedYears',
) => valid.reduce((n, m) => n + m[key], 0);
const ratio = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  rate: denominator ? numerator / denominator : null,
});
const report = {
  formatVersion: 1,
  status: rows.length === goldenFixtures.length ? 'COMPLETE' : 'PARTIAL',
  runId,
  datasetHash,
  gate,
  evaluatedFixtureIds: rows.filter((r) => r.runId === runId).map((r) => r.fixtureId),
  retainedFixtureIds: retained.map((r) => r.fixtureId),
  summary: {
    semanticScoredFixtureCount: valid.length,
    unscoredFixtureCount: rows.length - valid.length,
    schemaValidResponseRate: ratio(valid.length, rows.length),
    exactEvidenceSupportRate: ratio(sum('exactSupported'), sum('candidateCount')),
    precision: ratio(sum('truePositives'), sum('candidateCount')),
    recall: ratio(
      sum('truePositives'),
      rows.reduce((n, r) => n + r.metrics.goldenCount, 0),
    ),
    classificationCorrectness: ratio(sum('priorityCorrect'), sum('priorityCompared')),
    numericExperienceYearCorrectness: ratio(
      sum('yearsCorrect'),
      goldenFixtures
        .filter((f) => rows.some((r) => r.fixtureId === f.id))
        .reduce((n, f) => n + f.requirements.filter((g) => g.kind === 'experience').length, 0),
    ),
    noExperienceCorrectness: ratio(
      valid.filter((m) => m.noExperienceCorrect).length,
      rows.filter((r) =>
        goldenFixtures
          .find((f) => f.id === r.fixtureId)!
          .requirements.every((g) => g.kind !== 'experience'),
      ).length,
    ),
    falsePositiveCount: sum('falsePositives'),
    unsupportedClaimCount: sum('unsupportedClaims'),
    unexpectedExperienceCount: sum('unexpectedYears'),
    strictSchemaFailures: rows.filter((r) => r.failureCategory === 'output_schema').length,
    strictEvidenceFailures: rows.filter((r) => r.failureCategory === 'evidence_rejected').length,
    transportOrCompletionFailures: rows.filter(
      (r) =>
        r.failureCategory && !['output_schema', 'evidence_rejected'].includes(r.failureCategory),
    ).length,
  },
  fixtures: rows,
};
mkdirSync('artifacts', { recursive: true });
writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
writeFileSync(`artifacts/evaluation-${runId}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: target, summary: report.summary }, null, 2));
