import { describe, expect, it, vi } from 'vitest';
import { verifyLocalOllama } from '../lib/verification.ts';
import { fixtures } from '../fixtures/jobs.ts';

const digest = 'a'.repeat(64);
const valid = {
  requirements: [
    {
      term: 'React',
      kind: 'skill',
      priority: 'required',
      evidence: 'Required skills: TypeScript, React.',
      minYears: null,
    },
  ],
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const chat = (content: unknown = valid, metadata: Record<string, unknown> = {}) =>
  json({
    model: 'qwen3:4b',
    done: true,
    done_reason: 'stop',
    message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    ...metadata,
  });
function transport(response: Response) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ version: '0.21.1' }))
    .mockResolvedValueOnce(json({ models: [{ name: 'qwen3:4b', digest }] }))
    .mockResolvedValueOnce(response);
}

describe('metadata verifier — explicitly MOCK transport, never live evidence', () => {
  it('checks the local service, installed exact tag and successful validated completion', async () => {
    const request = transport(chat());
    const report = await verifyLocalOllama(request);
    expect(report.status).toBe('PASS');
    expect(report.model).toBe('qwen3:4b');
    expect(report.modelDigest).toBe(digest);
    expect(report.fixtureId).toBe('synthetic-job-001');
    expect(report.requirementCount).toBe(1);
    expect(report.failureCategory).toBeNull();
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.checks).toEqual({
      httpStatus: 200,
      responseModel: 'qwen3:4b',
      done: true,
      doneReason: 'stop',
      schemaValid: true,
      evidenceValid: true,
    });
    expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/version',
      '/api/tags',
      '/api/chat',
    ]);
    expect(request.mock.calls.every(([, init]) => init?.redirect === 'error')).toBe(true);
    const saved = JSON.stringify(report);
    expect(saved).not.toContain('requirements');
    expect(saved).not.toContain(fixtures[0].description);
  });
  it('records an unavailable service without invented counts or raw errors', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('PRIVATE SENTINEL'));
    const report = await verifyLocalOllama(request);
    expect(report.status).toBe('UNVERIFIED');
    expect(report.failureCategory).toBe('service_unavailable');
    expect(report.requirementCount).toBeNull();
    expect(report.inferenceAttempted).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain('PRIVATE SENTINEL');
  });
  it('never downloads a missing model or substitutes another tag', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ version: '0.21.1' }))
      .mockResolvedValueOnce(json({ models: [{ name: 'qwen3:latest', digest }] }));
    const report = await verifyLocalOllama(request);
    expect(report.status).toBe('UNVERIFIED');
    expect(report.failureCategory).toBe('model_missing');
    expect(report.inferenceAttempted).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['model_identity', () => chat(valid, { model: 'qwen3:4b-other' })],
    ['incomplete_completion', () => chat(valid, { done_reason: 'length' })],
    ['incomplete_completion', () => chat(valid, { done: false })],
    ['response_contract', () => chat(valid, { done_reason: undefined })],
    ['response_json', () => new Response('not json')],
    ['output_json', () => chat('not json')],
    ['output_schema', () => chat({ ...valid, unwanted: 'PRIVATE SENTINEL' })],
    [
      'evidence_rejected',
      () => chat({ requirements: [{ ...valid.requirements[0], term: 'AWS' }] }),
    ],
    [
      'evidence_rejected',
      () =>
        chat({
          requirements: [
            { ...valid.requirements[0], evidence: 'required skills: typescript, react.' },
          ],
        }),
    ],
    ['http_error', () => json({}, 503)],
    ['http_error', () => json({}, 201)],
    ['output_limit', () => new Response('x'.repeat(48001))],
  ] as const)('distinguishes %s without saving rejected output', async (category, response) => {
    const report = await verifyLocalOllama(transport(response()));
    expect(report.status).toBe('FAIL');
    expect(report.failureCategory).toBe(category);
    expect(report.inferenceAttempted).toBe(true);
    expect(report.requirementCount).toBe(category === 'evidence_rejected' ? 1 : null);
    expect(JSON.stringify(report)).not.toContain('PRIVATE SENTINEL');
    if (category === 'output_schema') expect(report.checks.schemaValid).toBe(false);
    if (category === 'evidence_rejected')
      expect(report.checks).toMatchObject({
        schemaValid: true,
        evidenceValid: false,
        rejectionReason: 'quote_or_term',
      });
  });
});
