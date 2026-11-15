import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferRequirements, localEndpoint } from '../lib/ollama.ts';
import { fixtures } from '../fixtures/jobs.ts';
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
const response = (content: unknown) =>
  new Response(
    JSON.stringify({
      model: 'qwen3:4b',
      done: true,
      done_reason: 'stop',
      message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    }),
  );
afterEach(() => vi.unstubAllEnvs());
describe('Ollama adapter — MOCK transport, never live verification', () => {
  it('sends bounded structured requests to loopback with no fallback', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(response(valid));
    const r = await inferRequirements(fixtures[0].description, mock);
    expect(r.provider).toBe('ollama');
    expect(r.inputHash).toHaveLength(64);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('qwen3:4b');
    expect(body.think).toBe(false);
    expect(body.format.additionalProperties).toBe(false);
    expect(init?.redirect).toBe('error');
  });
  it('rejects external endpoints, credentials, paths and redirects', () => {
    for (const url of [
      'https://api.example.com',
      'http://192.168.1.2:11434',
      'http://127.0.0.1:11434/v1',
      'http://user:pw@localhost:11434',
    ]) {
      vi.stubEnv('OLLAMA_BASE_URL', url);
      expect(() => localEndpoint()).toThrow('loopback');
    }
  });
  it('rejects unsupported, malformed, incomplete and oversized model output', async () => {
    for (const r of [
      response('not json'),
      response({ requirements: [{ ...valid.requirements[0], term: 'Invented' }] }),
      new Response(JSON.stringify({ done: false })),
      new Response('x'.repeat(48001)),
    ])
      await expect(
        inferRequirements(fixtures[0].description, vi.fn<typeof fetch>().mockResolvedValue(r)),
      ).rejects.toThrow();
  });
  it('does not silently fall back when Ollama is unavailable', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(inferRequirements(fixtures[0].description, request)).rejects.toThrow(
      'No fallback',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('exposes timeout and serializes inference requests', async () => {
    await expect(
      inferRequirements(
        fixtures[0].description,
        vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
      ),
    ).rejects.toThrow('300 seconds');
    let finish!: (r: Response) => void;
    const pending = inferRequirements(
      fixtures[0].description,
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    await expect(inferRequirements(fixtures[0].description)).rejects.toThrow('already running');
    finish(response(valid));
    await pending;
  });
});
