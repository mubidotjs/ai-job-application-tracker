import { extractionSchema, type Requirement } from './contracts.ts';
import { normalized } from './normalize.ts';
import { hasExactEvidence } from './domain.ts';
import type { GoldenFixture } from '../fixtures/extraction-golden.ts';

const family = (r: Requirement) =>
  ['skill', 'technology'].includes(r.kind) ? 'skill-or-technology' : r.kind;
export function scoreExtraction(fixture: GoldenFixture, candidate: unknown) {
  const parsed = extractionSchema.safeParse(candidate);
  if (!parsed.success)
    return { schemaValid: false as const, goldenCount: fixture.requirements.length };
  const available = new Set(fixture.requirements.map((r) => r.id));
  let truePositives = 0,
    exactSupported = 0,
    unsupportedClaims = 0,
    priorityCorrect = 0,
    priorityCompared = 0,
    yearsCorrect = 0,
    yearsCompared = 0;
  const matchedIds: string[] = [],
    missingIds: string[] = [];
  for (const actual of parsed.data.requirements) {
    const exact = hasExactEvidence(fixture.description, actual);
    if (exact) exactSupported++;
    else unsupportedClaims++;
    const expected = fixture.requirements.find(
      (g) =>
        available.has(g.id) &&
        family(g) === family(actual) &&
        g.aliases.some((alias) => normalized(alias) === normalized(actual.term)),
    );
    if (expected) {
      available.delete(expected.id);
      matchedIds.push(expected.id);
      truePositives++;
      priorityCompared++;
      if (expected.priority === actual.priority) priorityCorrect++;
      if (expected.kind === 'experience') {
        yearsCompared++;
        if (expected.minYears === actual.minYears) yearsCorrect++;
      }
    }
    // Source-backed text can still be a semantic false positive (e.g. instructions).
    if (fixture.forbiddenTerms.some((t) => normalized(t) === normalized(actual.term)) && exact)
      unsupportedClaims++;
    if (actual.kind === 'experience' && !expected) {
      yearsCompared++;
    }
  }
  missingIds.push(...available);
  const noExperienceExpected = fixture.requirements.every((r) => r.kind !== 'experience');
  const noExperienceCorrect =
    noExperienceExpected &&
    parsed.data.requirements.every((r) => r.kind !== 'experience' && r.minYears === null);
  const expectedYears = fixture.requirements.filter((r) => r.kind === 'experience').length;
  const unexpectedYears = parsed.data.requirements.filter(
    (actual) =>
      actual.kind === 'experience' &&
      !fixture.requirements.some(
        (g) =>
          g.kind === 'experience' &&
          g.aliases.some((alias) => normalized(alias) === normalized(actual.term)),
      ),
  ).length;
  return {
    schemaValid: true as const,
    goldenCount: fixture.requirements.length,
    candidateCount: parsed.data.requirements.length,
    truePositives,
    falsePositives: parsed.data.requirements.length - truePositives,
    falseNegatives: available.size,
    exactSupported,
    unsupportedClaims,
    priorityCorrect,
    priorityCompared,
    yearsCorrect,
    yearsCompared,
    expectedYears,
    unexpectedYears,
    noExperienceExpected,
    noExperienceCorrect,
    matchedIds,
    missingIds,
  };
}
