import type { GoldenFixture } from '../fixtures/extraction-golden.ts';
import type { scoreExtraction } from './extraction-metrics.ts';

export type ScoredEvaluation = {
  fixtureId: string;
  status: string;
  failureCategory: string | null;
  metrics: ReturnType<typeof scoreExtraction>;
};
// The baseline's arithmetic and denominators, unchanged. Pure and shared by both
// sides of the holdout comparison; application acceptance is reported separately.
export function summarizeEvaluation(rows: ScoredEvaluation[], fixtures: GoldenFixture[]) {
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
      | 'unexpectedYears',
  ) => valid.reduce((n, m) => n + m[key], 0);
  const ratio = (numerator: number, denominator: number) => ({
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : null,
  });
  return {
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
      fixtures
        .filter((f) => rows.some((r) => r.fixtureId === f.id))
        .reduce((n, f) => n + f.requirements.filter((g) => g.kind === 'experience').length, 0),
    ),
    noExperienceCorrectness: ratio(
      valid.filter((m) => m.noExperienceCorrect).length,
      rows.filter((r) =>
        fixtures
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
  };
}
