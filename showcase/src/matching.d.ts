import type { Profile, Requirement, Fit } from './types.js';
export function matchProfile(
  profile: Profile | null,
  extraction: { requirements: Requirement[] } | null,
): Fit | null;
