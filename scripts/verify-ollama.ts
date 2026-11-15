import { mkdirSync, writeFileSync } from 'node:fs';
import { fixtures } from '../fixtures/jobs.ts';
import { inferRequirements } from '../lib/ollama.ts';

// Runs only on committed synthetic data. It neither reads nor writes private SQLite records.
try {
  const result = await inferRequirements(fixtures[0].description);
  const report = {
    status: 'PASS',
    verification: 'real local HTTP inference; no mock transport',
    fixture: 'Northstar Labs / Frontend Engineer',
    ...result,
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/ollama-verification.json', JSON.stringify(report, null, 2));
  console.log(
    `Real AI verification: PASS — ${result.model}, ${result.requirements.length} validated requirements, ${result.durationMs}ms. Report: artifacts/ollama-verification.json`,
  );
} catch (e) {
  console.error(
    `Real AI verification: UNVERIFIED — ${e instanceof Error ? e.message : 'local request failed'}`,
  );
  process.exitCode = 1;
}
