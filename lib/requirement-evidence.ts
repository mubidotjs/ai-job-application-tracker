import { containsTerm } from './normalize.ts';

// Rejection predicates only: model output is never rewritten.
export function statementsForTerm(text: string, term: string) {
  return text.split(/(?<=[.!?])\s+|[\r\n;]+/).filter((s) => containsTerm(s, term));
}
export function priorityFacts(text: string) {
  const negativeRequired =
    /\bnot\s+(?:required|essential|necessary)\b|\bno\s+(?:prior\s+)?experience\s+(?:is\s+)?(?:required|needed)\b/gi;
  const negativePreferred = /\bnot\s+(?:preferred|desirable)\b/gi;
  const negatedRequired = negativeRequired.test(text);
  const negatedPreferred = negativePreferred.test(text);
  const positive = text.replace(negativeRequired, ' ').replace(negativePreferred, ' ');
  return {
    required: /\b(must|required|require|essential|minimum|at least)\b/i.test(positive),
    preferred: /\b(preferred|bonus|nice.to.have|desirable|ideally)\b/i.test(positive),
    negatedRequired,
    negatedPreferred,
  };
}
export function requirementContext(text: string, term: string) {
  const statements = statementsForTerm(text, term);
  const facts = statements.map(priorityFacts);
  const required = facts.some((f) => f.required),
    preferred = facts.some((f) => f.preferred);
  const negatedRequired = facts.some((f) => f.negatedRequired),
    negatedPreferred = facts.some((f) => f.negatedPreferred);
  return {
    statements,
    required,
    preferred,
    negatedRequired,
    negatedPreferred,
    negatedOnly:
      facts.length > 0 &&
      facts.every((f) => (f.negatedRequired || f.negatedPreferred) && !f.required && !f.preferred),
    requiredConflict: required && negatedRequired,
    preferredConflict: preferred && negatedPreferred,
  };
}
