import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = process.env.SHOWCASE_BASE_URL || 'http://127.0.0.1:3103';
mkdirSync('docs', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const shots = [];
  for (const [name, width, height, route] of [
    ['showcase-desktop', 1440, 1000, '/'],
    ['showcase-tablet', 768, 1024, '/'],
    ['showcase-mobile', 390, 844, '/'],
    ['showcase-fit', 1440, 1000, '/#job/synthetic-5/fit'],
    ['og', 1200, 630, '/'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(new URL(route, base).href);
    await page.locator('#content h1').waitFor();
    const file = name === 'og' ? 'public/og.png' : `docs/${name}.png`;
    await page.screenshot({ path: file, animations: 'disabled' });
    shots.push({
      file,
      width,
      height,
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    });
  }
  writeFileSync(
    'docs/screenshots.json',
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        syntheticOnly: true,
        actualBrowserScreenshots: true,
        liveInference: false,
        screenshots: shots,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Captured actual showcase viewports and 1200 × 630 Open Graph image.');
} finally {
  await browser.close();
}
