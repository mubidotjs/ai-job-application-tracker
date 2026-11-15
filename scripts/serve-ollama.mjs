import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Optional local launcher for the authorized D:-drive installation. Never pulls models.
const localBinary = resolve('.local-tools/ollama/ollama.exe');
const localInstall = process.platform === 'win32' && existsSync(localBinary);
const child = spawn(localInstall ? localBinary : 'ollama', ['serve'], {
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    OLLAMA_HOST: '127.0.0.1:11434',
    OLLAMA_NO_CLOUD: '1',
    ...(localInstall && !process.env.OLLAMA_MODELS
      ? { OLLAMA_MODELS: resolve('.local-models') }
      : {}),
  },
});
child.on('error', () => {
  console.error('Cannot start Ollama. Install it before using this launcher.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
