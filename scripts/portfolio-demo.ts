import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const capture = process.argv.includes('--capture');
mkdirSync('artifacts', { recursive: true });
const database = resolve(`artifacts/portfolio-demo-${randomUUID()}.sqlite`);
const env = { ...process.env, DATABASE_PATH: database, NEXT_TELEMETRY_DISABLED: '1' };
const seed = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/demo.ts'], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
if (seed.status !== 0) process.exit(1);
const socket = createServer();
await new Promise<void>((accept) => socket.listen(0, '127.0.0.1', accept));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((accept) => socket.close(() => accept()));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['scripts/next.mjs', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env,
    stdio: 'inherit',
    windowsHide: true,
  },
);
async function stop() {
  if (server.exitCode === null) {
    const exited = new Promise<void>((accept) => server.once('exit', () => accept()));
    server.kill();
    await exited;
  }
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});
if (!capture) {
  console.log(
    `Synthetic-only demo: ${base}\nNew isolated workspace created. No live inference is performed automatically. Press Ctrl+C to stop.`,
  );
} else {
  let browser;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Demo server exited');
      try {
        if ((await fetch(base)).ok) break;
      } catch {
        /* Starting. */
      }
      await new Promise((accept) => setTimeout(accept, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/tracker', (route) => {
      if (route.request().postDataJSON()?.action === 'extract')
        throw new Error('Live extraction is prohibited in screenshot capture');
      return route.continue();
    });
    await page.goto(base);
    await expect(page.locator('tbody tr')).toHaveCount(21);
    const data = await (await page.request.get(base + '/api/tracker')).json();
    if (!data.jobs.every((j: { synthetic: boolean }) => j.synthetic))
      throw new Error('Demo must contain only synthetic records');
    const shots: { file: string; width: number; height: number; sha256: string }[] = [];
    async function shot(file: string) {
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Demo layout overflows');
      await page.screenshot({ path: 'docs/' + file, animations: 'disabled' });
      shots.push({
        file,
        ...page.viewportSize()!,
        sha256: createHash('sha256')
          .update(readFileSync('docs/' + file))
          .digest('hex'),
      });
    }
    await shot('demo-dashboard.png');
    await page
      .getByRole('row')
      .filter({ hasText: 'Atlas Grid' })
      .getByRole('button', { name: 'Backend Engineer', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Fit comparison', exact: true }).click();
    await expect(page.locator('.result-label.missing').first()).toBeVisible();
    await shot('demo-fit.png');
    await page.getByRole('tab', { name: 'Requirements', exact: true }).click();
    await expect(page.getByText('Human-entered / corrected · not live AI')).toBeVisible();
    await shot('demo-requirements.png');
    await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
    await shot('demo-backup.png');
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('demo-mobile.png');
    if (errors.length) throw new Error('Browser errors during synthetic capture');
    writeFileSync(
      'docs/demo-capture.json',
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          source: 'Actual Chromium screenshots of the running production application',
          data: '20 unchanged invented fixture jobs plus one invented manual example, fictional verified résumé, human/demo requirement rules',
          liveInferenceDuringCapture: false,
          jobCount: data.jobs.length,
          screenshots: shots,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'Captured five genuine synthetic-only desktop/mobile screenshots. No model inference was invoked.',
    );
  } finally {
    await browser?.close();
    await stop();
  }
}
