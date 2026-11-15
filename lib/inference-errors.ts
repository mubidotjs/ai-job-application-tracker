export type FailureCategory =
  | 'configuration'
  | 'service_unavailable'
  | 'model_missing'
  | 'http_error'
  | 'timeout'
  | 'output_limit'
  | 'response_json'
  | 'response_contract'
  | 'model_identity'
  | 'incomplete_completion'
  | 'output_json'
  | 'output_schema'
  | 'evidence_rejected'
  | 'busy'
  | 'input'
  | 'unexpected';

export type InferenceChecks = {
  httpStatus: number | null;
  responseModel: string | null;
  done: boolean | null;
  doneReason: string | null;
  schemaValid: boolean | null;
  evidenceValid: boolean | null;
  rejectionReason?:
    | 'quote_or_term'
    | 'instruction'
    | 'contradiction'
    | 'duplicate'
    | 'numeric_kind'
    | 'numeric_years'
    | 'required_marker'
    | 'preferred_marker'
    | 'other';
};
export const emptyChecks = (): InferenceChecks => ({
  httpStatus: null,
  responseModel: null,
  done: null,
  doneReason: null,
  schemaValid: null,
  evidenceValid: null,
});

export class InferenceError extends Error {
  readonly category: FailureCategory;
  readonly checks: InferenceChecks;
  constructor(category: FailureCategory, message: string, checks: InferenceChecks = emptyChecks()) {
    super(message);
    this.name = 'InferenceError';
    this.category = category;
    this.checks = checks;
  }
}
