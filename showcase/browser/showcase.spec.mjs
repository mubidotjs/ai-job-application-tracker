import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const notice =
  'Interactive synthetic demo. No live AI inference or personal data processing. Real Qwen3 inference is available in the local-first application.';
test('search, filters, deterministic matching, temporary review/tracking, draft approval and reset — static only', async ({
  page,
  baseURL,
}) => {
  const violations = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (
      url.protocol.startsWith('http') &&
      (url.origin !== new URL(baseURL).origin ||
        req.method() !== 'GET' ||
        url.pathname.startsWith('/api/'))
    )
      violations.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByLabel('Public demo notice')).toHaveText(notice);
  await page.getByRole('link', { name: /^Opportunities/ }).click();
  await expect(page.locator('.job-row')).toHaveCount(21);
  await page.getByLabel('Search fictional opportunities').fill('Atlas');
  await expect(page.locator('.job-row')).toHaveCount(1);
  expect(
    await page
      .locator('.job-row .fit-bar')
      .evaluate(
        (bar) =>
          bar.firstElementChild.getBoundingClientRect().width / bar.getBoundingClientRect().width,
      ),
  ).toBeCloseTo(0.43, 2);
  await page.getByLabel('Application status', { exact: true }).selectOption('Offer');
  await expect(
    page.getByRole('heading', { name: 'No opportunities match this view' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Search fictional opportunities').fill('Atlas');
  await page.getByRole('link', { name: 'Backend Engineer', exact: true }).click();
  await expect(page.getByText('Authored example · no live AI.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Fit comparison', exact: true }).click();
  await expect(page.getByText('3 of 7 weighted points', { exact: true })).toBeVisible();
  await expect(page.locator('.result.missing')).toHaveCount(2);
  await page.getByRole('link', { name: 'Requirements', exact: true }).click();
  await page
    .getByRole('button', { name: 'Preview: flag priority for human assessment', exact: true })
    .first()
    .click();
  await page.getByRole('link', { name: 'Fit comparison', exact: true }).click();
  await expect(page.getByText('0 of 4 weighted points', { exact: true })).toBeVisible();
  await page.getByLabel('Fictional application stage').selectOption('Offer');
  await expect(page.getByLabel('Fictional application stage')).toHaveValue('Offer');
  await page.reload();
  await expect(page.getByLabel('Fictional application stage')).toHaveValue('Interview');
  await expect(page.getByText('3 of 7 weighted points', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Draft preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview approval', exact: true })).toBeDisabled();
  await page.getByLabel('I reviewed this synthetic example and its fictional evidence.').check();
  await page.getByRole('button', { name: 'Preview approval', exact: true }).click();
  await expect(
    page
      .locator('#content')
      .getByText('Approved preview only. Nothing was saved or sent.', { exact: true }),
  ).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy synthetic example', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Synthetic example copied', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'SYNTHETIC COVER-NOTE EXAMPLE',
  );
  await page.getByRole('button', { name: 'Reject example', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Copy synthetic example', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('accessible routes and responsive desktop, tablet and mobile layouts', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      '/#dashboard',
      '/#opportunities',
      '/#job/synthetic-5/fit',
      '/#job/synthetic-5/drafts',
      '/#profile',
      '/#ai',
      '/#capabilities',
      '/case-study.html',
    ]) {
      await page.goto(route);
      await expect(page.getByLabel('Public demo notice')).toHaveText(notice);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route,
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(result.violations, `${viewport.width} ${route}`).toEqual([]);
    }
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Make your next move a considered one.' }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`showcase-${viewport.width}.png`),
      animations: 'disabled',
    });
  }
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('metadata, genuine local screenshots, missing-route and failed-module states', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Rolecraft · Interactive Synthetic Showcase');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://rolecraft.mubashirhussain.dev/',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://rolecraft.mubashirhussain.dev/assets/og.png',
  );
  const response = await request.get('/');
  expect(response.headers()['content-security-policy']).toContain("connect-src 'none'");
  for (const path of [
    '/api/tracker',
    '/api/workspace',
    '/data/tracker.sqlite',
    '/.env',
    '/not-a-real-page',
  ])
    expect((await request.get(path)).status()).toBe(404);
  await page.goto('/#capabilities');
  for (const image of await page.locator('.gallery img').all())
    await expect(image).toHaveJSProperty('naturalWidth', 1440);
  await page.route('**/app.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The showcase could not load');
});
