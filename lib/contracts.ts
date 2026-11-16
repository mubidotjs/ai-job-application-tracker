import { z } from 'zod';
import type { InferenceChecks } from './inference-errors.ts';

const short = z.string().trim().min(1).max(160);
export const statuses = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'] as const;
export const date = z
  .string()
  .refine(
    (v) =>
      v === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    'Use a valid YYYY-MM-DD date',
  );
export const jobInput = z
  .object({
    company: short,
    position: short,
    location: short,
    employmentType: z
      .enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Unknown'])
      .default('Unknown'),
    salary: z.string().trim().max(160).default(''),
    sourceUrl: z
      .union([
        z.literal(''),
        z
          .url()
          .max(1000)
          .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol), 'Use an HTTP(S) URL'),
      ])
      .default(''),
    description: z.string().trim().min(30).max(12000),
    synthetic: z.boolean().default(false),
  })
  .strict();
export type JobInput = z.infer<typeof jobInput>;

export const requirementSchema = z
  .object({
    term: short,
    kind: z.enum(['skill', 'technology', 'experience', 'responsibility', 'constraint']),
    priority: z.enum(['required', 'preferred', 'unknown']),
    evidence: z.string().trim().min(3).max(500),
    minYears: z.number().int().min(0).max(50).nullable(),
  })
  .strict();
export const extractionSchema = z
  .object({ requirements: z.array(requirementSchema).min(1).max(24) })
  .strict();

// Express the existing domain invariant in the generation grammar as well.
// The persisted/API shape remains unchanged; invalid claims are never repaired.
const modelRequirementFields = {
  term: requirementSchema.shape.term,
  priority: requirementSchema.shape.priority,
  evidence: requirementSchema.shape.evidence,
};
export const modelRequirementSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('experience'),
      ...modelRequirementFields,
      minYears: requirementSchema.shape.minYears,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['skill', 'technology', 'responsibility', 'constraint']),
      ...modelRequirementFields,
      minYears: z.null(),
    })
    .strict(),
]);
export const modelExtractionSchema = z
  .object({
    requirements: z.array(modelRequirementSchema).min(1).max(24),
  })
  .strict();
export type Requirement = z.infer<typeof requirementSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type OriginalInference = Extraction & {
  provider: 'ollama';
  model: string;
  at: string;
  durationMs: number;
  inputHash: string;
  verification?: InferenceChecks;
};
export type ExtractionRecord = Extraction & {
  provider: 'ollama' | 'human';
  model: string;
  at: string;
  durationMs: number;
  inputHash: string;
  verification?: InferenceChecks;
  originalInference?: OriginalInference;
};

export const skillSchema = z
  .object({ name: short, evidence: z.string().trim().min(2).max(500) })
  .strict();
export const profileSchema = z
  .object({
    resume: z.string().trim().min(30).max(16000),
    skills: z.array(skillSchema).max(60),
    experience: z
      .array(
        z
          .object({
            area: short,
            years: z.number().min(0).max(50),
            evidence: z.string().trim().min(3).max(500),
          })
          .strict(),
      )
      .max(20),
    verified: z.boolean(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export const trackingSchema = z
  .object({
    status: z.enum(statuses),
    appliedDate: date,
    followUpDate: date,
    notes: z.string().max(6000),
  })
  .strict()
  .refine(
    (v) => v.status === 'Saved' || v.appliedDate !== '',
    'Set the application date before moving beyond Saved',
  );
export type Tracking = z.infer<typeof trackingSchema>;
export type Job = JobInput &
  Tracking & {
    id: string;
    createdAt: string;
    updatedAt: string;
    extraction: ExtractionRecord | null;
    extractionError: string | null;
    nearDuplicates: { id: string; company: string; position: string }[];
  };
export type Draft = {
  id: string;
  jobId: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt: string | null;
  evidence: string[];
  stale: boolean;
};
