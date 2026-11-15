import { mkdirSync, writeFileSync } from 'node:fs';
import { fixtures } from '../fixtures/jobs.ts';
import { csvCell } from '../lib/domain.ts';
const columns = [
  'company',
  'position',
  'location',
  'employmentType',
  'salary',
  'sourceUrl',
  'description',
  'synthetic',
] as const;
mkdirSync('public', { recursive: true });
writeFileSync(
  'public/synthetic-jobs.csv',
  [columns.join(','), ...fixtures.map((j) => columns.map((c) => csvCell(j[c])).join(','))].join(
    '\r\n',
  ),
);
console.log('Wrote 20 explicitly synthetic fixture jobs to public/synthetic-jobs.csv');
