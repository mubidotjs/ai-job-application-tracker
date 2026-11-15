import type { Extraction, Profile } from './contracts.ts';
import { skillKey } from './normalize.ts';

export function matchProfile(profile: Profile | null, extraction: Extraction | null) {
  if (!profile?.verified || !extraction?.requirements.length) return null;
  const rows = extraction.requirements.map((r) => {
    const weight = r.priority === 'required' ? 3 : r.priority === 'preferred' ? 1 : 0;
    const skill = profile.skills.find((s) => skillKey(s.name) === skillKey(r.term));
    const exp = profile.experience.find((e) => skillKey(e.area) === skillKey(r.term));
    let result: 'matched' | 'missing' | 'unknown' = 'unknown';
    let evidence = 'Needs human assessment';
    if (r.priority !== 'unknown' && (r.kind === 'skill' || r.kind === 'technology')) {
      result = skill ? 'matched' : 'missing';
      evidence = skill?.evidence ?? 'No verified résumé evidence';
    } else if (r.priority !== 'unknown' && r.kind === 'experience' && r.minYears !== null) {
      result = exp ? (exp.years >= r.minYears ? 'matched' : 'missing') : 'unknown';
      evidence = exp?.evidence ?? 'No explicit verified years for this area';
    }
    return {
      ...r,
      weight,
      result,
      profileEvidence: evidence,
      points: result === 'matched' ? weight : 0,
    };
  });
  const possible = rows.reduce((sum, r) => sum + r.weight, 0);
  const earned = rows.reduce((sum, r) => sum + r.points, 0);
  return {
    score: possible ? Math.round((earned / possible) * 100) : null,
    earned,
    possible,
    rows,
    matched: rows.filter((r) => r.result === 'matched').length,
    missing: rows.filter((r) => r.result === 'missing').length,
    unknown: rows.filter((r) => r.result === 'unknown').length,
  };
}
