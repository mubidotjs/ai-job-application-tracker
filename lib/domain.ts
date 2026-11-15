import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import {
  jobInput,
  profileSchema,
  extractionSchema,
  type JobInput,
  type Profile,
  type Extraction,
} from './contracts.ts';
import { normalized, skillKey } from './normalize.ts';
export { normalized, skillKey } from './normalize.ts';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const canonicalKey = (j: JobInput) =>
  hash([j.company, j.position, j.location, j.employmentType].map(normalized).join('|'));
export function sourceKey(url: string) {
  if (!url) return null;
  const u = new URL(url);
  u.hash = '';
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|ref$|source$|tracking|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, '');
  return u.toString();
}
export function likelyDuplicate(a: JobInput, b: JobInput) {
  if (normalized(a.company) !== normalized(b.company)) return false;
  const words = (s: string) => new Set(normalized(s).split(' '));
  const x = words(a.position),
    y = words(b.position);
  const overlap = [...x].filter((w) => y.has(w)).length;
  return overlap / Math.max(x.size, y.size) >= 0.6;
}
export function parseJobsCsv(csv: string): JobInput[] {
  if (Buffer.byteLength(csv) > 512000) throw new Error('CSV exceeds 500 KB');
  const rows = parse(csv.replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    max_record_size: 16000,
    to: 201,
  });
  if (!rows.length || rows.length > 200) throw new Error('Import between 1 and 200 rows at a time');
  return rows.map((value: unknown, i: number) => {
    const row = value as Record<string, string>;
    const parsed = jobInput.safeParse({ ...row, synthetic: row.synthetic === 'true' });
    if (!parsed.success)
      throw new Error(`CSV row ${i + 2}: check required fields, lengths, employment type and URL`);
    return parsed.data;
  });
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
const skills = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Node.js',
  'Python',
  'SQL',
  'SQLite',
  'PostgreSQL',
  'Docker',
  'Kubernetes',
  'AWS',
  'Git',
  'REST',
  'GraphQL',
  'Vitest',
  'Playwright',
  'Redis',
  'Java',
  'Go',
  'Figma',
  'Accessibility',
  'CI/CD',
  'Terraform',
];
export function extractProfile(resume: string): Profile {
  const sentences = resume.split(/\n|(?<=[.!?])\s+/).filter(Boolean);
  return validateProfile({
    resume,
    skills: skills.flatMap((name) => {
      const evidence = sentences.find((s) => containsTerm(s, name) && !negated(s, name));
      return evidence ? [{ name, evidence: evidence.slice(0, 500) }] : [];
    }),
    experience: [],
    verified: false,
  });
}
const contains = (a: string, b: string) =>
  a.normalize('NFKC').toLowerCase().includes(b.normalize('NFKC').toLowerCase());
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsTerm = (text: string, term: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escaped(term.normalize('NFKC'))}(?![\\p{L}\\p{N}])`, 'iu').test(
    text.normalize('NFKC'),
  );
const negated = (text: string, term: string) =>
  new RegExp(
    `\\b(?:no|not|without|never)\\b[^.!?\\n]{0,40}${escaped(term)}|${escaped(term)}[^.!?\\n]{0,30}\\b(?:never used|not used|no experience)\\b`,
    'i',
  ).test(text);
export function validateProfile(input: unknown) {
  const p = profileSchema.parse(input);
  for (const s of p.skills)
    if (
      !contains(p.resume, s.evidence) ||
      !containsTerm(s.evidence, s.name) ||
      negated(s.evidence, s.name)
    )
      throw new Error('Every skill needs a verbatim résumé quote containing its name');
  for (const e of p.experience) {
    if (
      !contains(p.resume, e.evidence) ||
      !containsTerm(e.evidence, e.area) ||
      negated(e.evidence, e.area) ||
      !new RegExp(`\\b${escaped(String(e.years))}\\+?\\s*(years?|yrs?)\\b`, 'i').test(e.evidence)
    )
      throw new Error(
        'Experience needs a verbatim quote with the area and explicit years; inferred tenure is not accepted',
      );
  }
  return p;
}
export function validateExtraction(input: unknown, description: string): Extraction {
  const extraction = extractionSchema.parse(input);
  const seen = new Set<string>();
  for (const r of extraction.requirements) {
    if (!hasExactEvidence(description, r))
      throw new Error(
        'Unsupported model claim: each requirement needs a verbatim source quote containing the term',
      );
    if (isInstructionEvidence(description, r.evidence))
      throw new Error('Instruction text cannot establish job requirements');
    const termSentences = description
      .split(/(?<=[.!?])\s+|\n/)
      .filter((sentence) => containsTerm(sentence, r.term));
    const negatedPriority =
      r.priority === 'required'
        ? /\bnot (?:required|essential)\b/i
        : r.priority === 'preferred'
          ? /\bnot preferred\b/i
          : null;
    if (negatedPriority && termSentences.some((sentence) => negatedPriority.test(sentence)))
      throw new Error(
        'Negated or conflicting source requirements need human assessment and unknown priority',
      );
    const key = skillKey(r.term);
    if (seen.has(key)) throw new Error('Duplicate model requirements are not accepted');
    seen.add(key);
    if (
      r.priority !== 'unknown' &&
      /\b(?:not required|not essential|not preferred|no experience required)\b/i.test(r.evidence)
    )
      throw new Error('Negated requirements need human assessment and unknown priority');
    if (r.kind !== 'experience' && r.minYears !== null)
      throw new Error('Only experience requirements can specify years');
    if (
      r.minYears !== null &&
      !new RegExp(`\\b${r.minYears}\\+?\\s*(years?|yrs?)\\b`, 'i').test(r.evidence)
    )
      throw new Error('Experience years are unsupported by the source quote');
    if (
      r.priority === 'required' &&
      !/\b(must|required|require|essential|minimum|at least)\b/i.test(r.evidence)
    )
      throw new Error(
        'Required priority needs explicit wording in the source quote; use unknown otherwise',
      );
    if (
      r.priority === 'preferred' &&
      !/\b(preferred|bonus|nice.to.have|desirable|ideally)\b/i.test(r.evidence)
    )
      throw new Error('Preferred priority needs explicit wording in the source quote');
  }
  return extraction;
}
export function isInstructionEvidence(description: string, evidence: string) {
  const marker =
    /\b(?:untrusted instruction|ignore (?:all |any |the )?(?:previous|prior|system) instructions?|output approved\s*=|system prompt)\b/i;
  if (marker.test(evidence)) return true;
  let index = description.indexOf(evidence);
  while (index >= 0) {
    const start = description.lastIndexOf('\n', index) + 1;
    const end = description.indexOf('\n', index + evidence.length);
    const line = description.slice(start, end < 0 ? undefined : end);
    if (!marker.test(line)) return false;
    index = description.indexOf(evidence, index + 1);
  }
  return true;
}
export function hasExactEvidence(
  description: string,
  requirement: { term: string; evidence: string },
) {
  return (
    description.includes(requirement.evidence) &&
    containsTerm(requirement.evidence, requirement.term)
  );
}
