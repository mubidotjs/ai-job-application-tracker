import { mkdirSync, writeFileSync } from 'node:fs';
import { verifyLocalOllama } from '../lib/verification.ts';

// Runs only on committed synthetic data. It neither reads nor writes private SQLite records.
// No transport injection, mocks, database reads or automatic model pulls in this entrypoint.
const report = await verifyLocalOllama();
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/ollama-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log('Metadata-only report: artifacts/ollama-verification.json');
process.exitCode = report.status === 'PASS' ? 0 : 1;
