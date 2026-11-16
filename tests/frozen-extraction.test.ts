import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { goldenFixtures } from '../fixtures/extraction-golden.ts';
import { holdoutFixtures } from '../fixtures/extraction-holdout.ts';

it('keeps the evaluated model adapter, prompts, contracts, validators and both datasets frozen — no inference', () => {
  const report = JSON.parse(readFileSync('docs/quality-correction/results.json', 'utf8'));
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  for (const [path, expected] of Object.entries(report.candidateSources))
    expect(hash(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')), path).toBe(expected);
  expect(hash(JSON.stringify(goldenFixtures))).toBe(report.datasetHash);
  expect(hash(JSON.stringify(holdoutFixtures))).toBe(report.holdoutHash);
});
