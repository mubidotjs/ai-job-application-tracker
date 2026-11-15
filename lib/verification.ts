import { z } from 'zod';
import { fixtures } from '../fixtures/jobs.ts';
import { extractionSchema } from './contracts.ts';
import { hash } from './domain.ts';
import { inferRequirements, localEndpoint, OLLAMA_MODEL } from './ollama.ts';
import {
  emptyChecks,
  InferenceError,
  type FailureCategory,
  type InferenceChecks,
} from './inference-errors.ts';

export type VerificationReport = {
  formatVersion: 1;
  status: 'PASS' | 'FAIL' | 'UNVERIFIED';
  transport: 'local-http';
  recordedAt: string;
  fixtureId: 'synthetic-job-001';
  fixturePath: 'fixtures/jobs.ts#fixtures[0]';
  fixtureHash: string;
  requestedModel: 'qwen3:4b';
  model: string | null;
  modelDigest: string | null;
  ollamaVersion: string | null;
  requirementCount: number | null;
  durationMs: number;
  inferenceAttempted: boolean;
  failureCategory: FailureCategory | null;
  checks: InferenceChecks;
};

export async function probeLocalOllama(
  path: '/api/version' | '/api/tags',
  request: typeof fetch = fetch,
) {
  const url = localEndpoint();
  url.pathname = path;
  const response = await request(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (response.status !== 200 || !response.body)
    throw new InferenceError('http_error', 'Local Ollama preflight failed.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256000)
        throw new InferenceError('output_limit', 'Local preflight exceeded 256 KB.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new InferenceError('response_json', 'Local preflight returned malformed JSON.');
  }
}

export async function verifyLocalOllama(
  request: typeof fetch = fetch,
): Promise<VerificationReport> {
  const start = Date.now();
  const report: VerificationReport = {
    formatVersion: 1,
    status: 'UNVERIFIED',
    transport: 'local-http',
    recordedAt: new Date().toISOString(),
    fixtureId: 'synthetic-job-001',
    fixturePath: 'fixtures/jobs.ts#fixtures[0]',
    fixtureHash: hash(fixtures[0].description),
    requestedModel: OLLAMA_MODEL,
    model: null,
    modelDigest: null,
    ollamaVersion: null,
    requirementCount: null,
    durationMs: 0,
    inferenceAttempted: false,
    failureCategory: null,
    checks: emptyChecks(),
  };
  try {
    const version = z
      .object({ version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/) })
      .safeParse(await probeLocalOllama('/api/version', request));
    if (!version.success)
      throw new InferenceError('response_contract', 'Invalid Ollama version metadata.');
    report.ollamaVersion = version.data.version;
    const tags = z
      .object({
        models: z
          .array(
            z.object({
              name: z.string().max(160),
              digest: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
            }),
          )
          .max(1000),
      })
      .safeParse(await probeLocalOllama('/api/tags', request));
    if (!tags.success)
      throw new InferenceError('response_contract', 'Invalid local model inventory.');
    const model = tags.data.models.find((m) => m.name === OLLAMA_MODEL);
    if (!model)
      throw new InferenceError(
        'model_missing',
        'qwen3:4b is not installed. Model downloads require authorization.',
      );
    report.modelDigest = model.digest;
    report.inferenceAttempted = true;
    const result = await inferRequirements(fixtures[0].description, request, (candidate) => {
      const parsed = extractionSchema.safeParse(candidate);
      if (parsed.success) report.requirementCount = parsed.data.requirements.length;
    });
    report.model = result.model;
    report.requirementCount = result.requirements.length;
    report.checks = result.verification;
    report.status = 'PASS';
  } catch (error) {
    report.failureCategory =
      error instanceof InferenceError
        ? error.category
        : error instanceof TypeError
          ? 'service_unavailable'
          : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'timeout'
            : 'unexpected';
    if (error instanceof InferenceError) {
      report.checks = error.checks;
      report.model = error.checks.responseModel;
    }
    // No completed validation can be claimed for an unavailable service or model.
    report.status = [
      'configuration',
      'service_unavailable',
      'model_missing',
      'timeout',
      'busy',
    ].includes(report.failureCategory)
      ? 'UNVERIFIED'
      : 'FAIL';
  }
  report.durationMs = Date.now() - start;
  return report;
}
