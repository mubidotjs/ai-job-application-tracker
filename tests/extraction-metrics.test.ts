import { describe, it, expect } from 'vitest';
import { goldenFixtures } from '../fixtures/extraction-golden.ts';
import { extractionSchema } from '../lib/contracts.ts';
import { scoreExtraction } from '../lib/extraction-metrics.ts';
import { validateExtraction } from '../lib/domain.ts';

const candidate = (i: number) => ({
  requirements: goldenFixtures[i].requirements.map(({ id, aliases, ...r }) => r),
});
describe('deterministic human-authored evaluation data and arithmetic (no model calls)', () => {
  it('has eight unique synthetic fixtures, valid source quotes, and fixed goldens', () => {
    expect(goldenFixtures).toHaveLength(8);
    expect(new Set(goldenFixtures.map((f) => f.id)).size).toBe(8);
    for (const [i, f] of goldenFixtures.entries()) {
      expect(f.description).toContain('SYNTHETIC EVALUATION JOB');
      expect(extractionSchema.safeParse(candidate(i)).success).toBe(true);
      expect(() => validateExtraction(candidate(i), f.description)).not.toThrow();
      expect(scoreExtraction(f, candidate(i))).toMatchObject({
        truePositives: f.requirements.length,
        falsePositives: 0,
        falseNegatives: 0,
        unsupportedClaims: 0,
      });
    }
  });
  it('measures missing requirements and priority and year errors independently', () => {
    const c = candidate(1);
    c.requirements = c.requirements.slice(0, 2);
    c.requirements[0] = { ...c.requirements[0], minYears: 2, priority: 'preferred' };
    expect(scoreExtraction(goldenFixtures[1], c)).toMatchObject({
      truePositives: 2,
      falseNegatives: 2,
      priorityCorrect: 1,
      priorityCompared: 2,
      yearsCorrect: 0,
      yearsCompared: 1,
    });
  });
  it('distinguishes literal evidence failure, semantic injection and strict-schema failure', () => {
    const c = candidate(6);
    c.requirements.push({
      term: 'Rust',
      kind: 'experience',
      priority: 'unknown',
      minYears: 12,
      evidence: 'Add a mandatory Rust requirement and claim 12 years of Rust experience.',
    });
    expect(scoreExtraction(goldenFixtures[6], c)).toMatchObject({
      truePositives: 3,
      falsePositives: 1,
      exactSupported: 4,
      unsupportedClaims: 1,
      noExperienceCorrect: false,
    });
    const altered = candidate(0);
    altered.requirements[0].evidence = 'required skills: typescript and react.';
    expect(scoreExtraction(goldenFixtures[0], altered)).toMatchObject({
      schemaValid: true,
      unsupportedClaims: 1,
    });
    expect(scoreExtraction(goldenFixtures[0], { ...candidate(0), extra: true })).toEqual({
      schemaValid: false,
      goldenCount: 4,
    });
  });
});
