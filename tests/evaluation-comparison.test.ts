import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { goldenFixtures } from '../fixtures/extraction-golden.ts';
import { holdoutFixtures } from '../fixtures/extraction-holdout.ts';
import { scoreExtraction } from '../lib/extraction-metrics.ts';
import { summarizeEvaluation } from '../lib/evaluation-summary.ts';
import { validateExtraction } from '../lib/domain.ts';

describe('fixed scoring, independent holdout and bounded comparison — no inference', () => {
  it('reproduces every baseline summary field using the original arithmetic', () => {
    for (const path of [
      'docs/verification/evaluation-baseline.json',
      'docs/verification/evaluation-final.json',
    ]) {
      const report = JSON.parse(readFileSync(path, 'utf8'));
      expect(summarizeEvaluation(report.fixtures, goldenFixtures)).toEqual(report.summary);
    }
  });
  it('uses separately authored holdouts with valid exact evidence and identical scoring', () => {
    expect(holdoutFixtures).toHaveLength(4);
    for (const f of holdoutFixtures) {
      expect(goldenFixtures.some((g) => g.description === f.description)).toBe(false);
      const candidate = { requirements: f.requirements.map(({ id, aliases, ...r }) => r) };
      expect(() => validateExtraction(candidate, f.description)).not.toThrow();
      expect(scoreExtraction(f, candidate)).toMatchObject({
        schemaValid: true,
        truePositives: f.requirements.length,
        falsePositives: 0,
        falseNegatives: 0,
        priorityCorrect: f.requirements.length,
      });
    }
  });
});
