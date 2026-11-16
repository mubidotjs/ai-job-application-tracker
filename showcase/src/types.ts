export type Requirement = {
  term: string;
  kind: 'skill' | 'technology' | 'experience' | 'responsibility' | 'constraint';
  priority: 'required' | 'preferred' | 'unknown';
  evidence: string;
  minYears: number | null;
};
export type Profile = {
  resume: string;
  verified: boolean;
  skills: { name: string; evidence: string }[];
  experience: { area: string; years: number; evidence: string }[];
};
export type DemoJob = {
  id: string;
  company: string;
  position: string;
  location: string;
  employmentType: string;
  salary: string;
  description: string;
  synthetic: true;
  status: string;
  appliedDate: string;
  followUpDate: string;
  requirements: Requirement[];
};
export type Fit = {
  score: number | null;
  earned: number;
  possible: number;
  matched: number;
  missing: number;
  unknown: number;
  rows: (Requirement & {
    weight: number;
    points: number;
    result: 'matched' | 'missing' | 'unknown';
    profileEvidence: string;
  })[];
};
