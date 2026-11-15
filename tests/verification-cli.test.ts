import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('runs the actual Node 24 strip-only CLI and writes safe metadata without Ollama or network', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rolecraft-verify-cli-'));
  try {
    const child = spawnSync(
      process.execPath,
      ['--experimental-strip-types', resolve('scripts/verify-ollama.ts')],
      {
        cwd: directory,
        env: { ...process.env, OLLAMA_BASE_URL: 'https://example.invalid' },
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    const report = JSON.parse(
      readFileSync(join(directory, 'artifacts/ollama-verification.json'), 'utf8'),
    );
    expect(report.status).toBe('UNVERIFIED');
    expect(report.failureCategory).toBe('configuration');
    expect(report.inferenceAttempted).toBe(false);
    expect(report.requirementCount).toBeNull();
    expect(child.stderr).not.toContain('SyntaxError');
    expect(child.stdout).not.toContain('requirements');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps the live quality evaluation closed when the real verifier cannot pass', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rolecraft-eval-gate-'));
  try {
    const child = spawnSync(
      process.execPath,
      ['--experimental-strip-types', resolve('scripts/evaluate-ollama.ts')],
      {
        cwd: directory,
        env: { ...process.env, OLLAMA_BASE_URL: 'https://example.invalid' },
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(JSON.parse(child.stdout).status).toBe('GATE_BLOCKED');
    expect(existsSync(join(directory, 'artifacts/evaluation-latest.json'))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
