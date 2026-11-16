import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { fixtures, syntheticResume } from '../fixtures/jobs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(here, 'dist');
if (out !== resolve(root, 'showcase/dist')) throw new Error('Unexpected output directory');
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'assets'), { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Explicit allowlist only. No recursive source/public/ignored-directory copying.
for (const file of ['index.html', 'case-study.html', 'styles.css', 'bootstrap.js'])
  copyFileSync(resolve(here, 'src', file), resolve(out, file));
writeFileSync(
  resolve(out, 'styles.css'),
  readFileSync(resolve(out, 'styles.css'), 'utf8') +
    '\n' +
    Array.from({ length: 101 }, (_, i) => `.fit-bar .fit-${i}{width:${i}%}`).join('\n'),
);
for (const file of ['favicon.svg', 'robots.txt'])
  copyFileSync(resolve(here, 'public', file), resolve(out, file));
copyFileSync(resolve(root, 'docs/demo-dashboard.png'), resolve(out, 'assets/local-dashboard.png'));
copyFileSync(resolve(root, 'docs/demo-fit.png'), resolve(out, 'assets/local-fit.png'));
copyFileSync(resolve(here, 'public/og.png'), resolve(out, 'assets/og.png'));
const sourceHashes = {};
for (const [source, target] of [
  ['lib/matching.ts', 'matching.js'],
  ['lib/normalize.ts', 'normalize.js'],
  ['showcase/src/app.ts', 'app.js'],
]) {
  const text = readFileSync(resolve(root, source), 'utf8');
  sourceHashes[source] = sha(text.replace(/\r\n/g, '\n'));
  const js = stripTypeScriptTypes(text, { mode: 'strip' }).replace(
    "'./normalize.ts'",
    "'./normalize.js'",
  );
  writeFileSync(resolve(out, target), js);
}
const fictionalProfile = {
  resume: syntheticResume,
  verified: true,
  skills: [
    'TypeScript',
    'JavaScript',
    'React',
    'Next.js',
    'Node.js',
    'SQL',
    'SQLite',
    'Git',
    'Vitest',
    'Playwright',
  ].map((name) => ({
    name,
    evidence: syntheticResume.split('\n').find((line) => line.startsWith('Skills used')),
  })),
  experience: [
    {
      area: 'JavaScript',
      years: 4,
      evidence: 'I have 4 years of JavaScript experience building internal business tools.',
    },
  ],
};
const manual = {
  company: 'Local Example Works',
  position: 'Local Tools Engineer',
  location: 'Remote · Global',
  employmentType: 'Contract',
  salary: 'Illustrative $90,000',
  synthetic: true,
  description:
    'SYNTHETIC MANUAL EXAMPLE — not a real vacancy. Required skills: React, TypeScript. Preferred skills: Playwright. Build accessible, local-first software tools. Minimum 3 years of JavaScript experience required.',
};
const stages = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'];
const demoJobs = [...fixtures, manual].map((job, index) => {
  // Fixed examples compiled from human-authored fixture wording. No extraction runs in the browser.
  const requirements = [];
  for (const [label, priority] of [
    ['Required', 'required'],
    ['Preferred', 'preferred'],
  ]) {
    const match = job.description.match(new RegExp(`${label} skills: ([^\\n]+?)\\.(?:\\n| |$)`));
    if (!match) throw new Error('Missing authored fixture requirements');
    for (const term of match[1].split(',').map((term) => term.trim()))
      requirements.push({
        term,
        kind: 'skill',
        priority,
        evidence: match[0].trim(),
        minYears: null,
      });
  }
  return {
    id: `synthetic-${index + 1}`,
    company: job.company,
    position: job.position,
    location: job.location,
    employmentType: job.employmentType,
    salary: job.salary,
    description: job.description,
    synthetic: true,
    status: index < 9 ? stages[1 + Math.floor(index / 3)] : index === 9 ? 'Rejected' : 'Saved',
    appliedDate: index < 10 ? 'Nov 12 · fictional' : '',
    followUpDate: index < 3 ? 'Follow-up due · fictional' : '',
    requirements,
  };
});
const fixedExtraction = {
  description:
    'SYNTHETIC FIXED EXAMPLE. Minimum 4 years of Python experience required. Docker is preferred. Review pull requests.',
  requirements: [
    {
      term: 'Python',
      kind: 'experience',
      priority: 'required',
      evidence: 'Minimum 4 years of Python experience required.',
      minYears: 4,
    },
    {
      term: 'Docker',
      kind: 'technology',
      priority: 'preferred',
      evidence: 'Docker is preferred.',
      minYears: null,
    },
    {
      term: 'Review pull requests',
      kind: 'responsibility',
      priority: 'unknown',
      evidence: 'Review pull requests.',
      minYears: null,
    },
  ],
};
writeFileSync(
  resolve(out, 'data.js'),
  `// Public invented examples only. No personal records or model response payloads.\nexport const jobs = ${JSON.stringify(demoJobs)};\nexport const profile = ${JSON.stringify(fictionalProfile)};\nexport const fixedExtraction = ${JSON.stringify(fixedExtraction)};\n`,
);
writeFileSync(
  resolve(out, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://rolecraft.mubashirhussain.dev/</loc></url><url><loc>https://rolecraft.mubashirhussain.dev/case-study.html</loc></url></urlset>',
);
writeFileSync(resolve(out, '404.html'), readFileSync(resolve(here, 'src/404.html')));
writeFileSync(resolve(out, 'vercel.json'), readFileSync(resolve(here, 'vercel.json')));
writeFileSync(
  resolve(out, 'artifact.json'),
  JSON.stringify(
    {
      kind: 'static-only-synthetic-showcase',
      localApplicationBaseline: 'aca0a75ee717e1032a9b55006c25a08d791f91d7',
      jobs: 21,
      liveInference: false,
      persistence: false,
      sourceHashes,
    },
    null,
    2,
  ) + '\n',
);
await import('./audit.mjs');
console.log(
  'Built isolated static showcase: 21 synthetic jobs, no server code, no runtime dependencies.',
);
