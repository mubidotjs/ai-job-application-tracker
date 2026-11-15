import { rmSync, mkdirSync } from 'node:fs';
export default function setup() {
  mkdirSync('data', { recursive: true });
  for (const name of ['data/e2e.sqlite', 'data/e2e.sqlite-wal', 'data/e2e.sqlite-shm'])
    rmSync(name, { force: true });
}
