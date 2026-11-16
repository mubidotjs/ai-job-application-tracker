import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fixtures } from '../fixtures/jobs';

test('backup download, preview cancellation, explicit replacement and corruption rejection preserve synthetic workspace state', async ({
  page,
  request,
}) => {
  const origin = { Origin: 'http://127.0.0.1:3100' };
  const before = await (await request.get('/api/tracker')).json();
  const job = before.jobs.find((j: { company: string }) => j.company === 'Manual Example Works');
  const detailBefore = await (await request.get('/api/tracker?id=' + job.id)).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
  await expect(
    page.getByText('Backups contain sensitive plaintext personal information.', { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download workspace backup', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('rolecraft-workspace.sqlite');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  const added = await request.post('/api/tracker', {
    headers: origin,
    data: {
      action: 'add',
      job: { ...fixtures[3], company: 'Synthetic Later Record', sourceUrl: '' },
    },
  });
  expect(added.ok()).toBe(true);
  const later = await (await request.get('/api/tracker')).json();
  const picker = page.getByLabel('Backup file (SQLite, up to 32 MiB)', { exact: true });
  const file = {
    name: 'synthetic-workspace.sqlite',
    mimeType: 'application/octet-stream',
    buffer: bytes,
  };
  await picker.setInputFiles(file);
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Backup checked · schema version 1' }),
  ).toBeVisible();
  const replace = page.getByRole('button', {
    name: 'Replace workspace with this backup',
    exact: true,
  });
  await expect(replace).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel restore', exact: true }).click();
  expect(await (await request.get('/api/tracker')).json()).toEqual(later);
  await picker.setInputFiles(file);
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.getByLabel('I understand this replaces all saved workspace data.').check();
  await replace.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Workspace restored from your confirmed backup' }),
  ).toBeVisible();
  expect(await (await request.get('/api/tracker')).json()).toEqual(before);
  expect(await (await request.get('/api/tracker?id=' + job.id)).json()).toEqual(detailBefore);

  await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
  await picker.setInputFiles({ ...file, buffer: Buffer.from('Synthetic corrupted backup') });
  await page.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Backup is corrupt, incompatible' }),
  ).toBeVisible();
  expect(await (await request.get('/api/tracker')).json()).toEqual(before);
  for (const headers of [
    origin,
    { Origin: 'https://untrusted.example', 'X-Rolecraft-Confirm': 'replace-workspace' },
  ]) {
    const rejected = await request.post('/api/workspace?action=restore&path=../../private.sqlite', {
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      data: bytes,
    });
    expect(rejected.status()).toBe(400);
  }
  const tooLarge = await request.post('/api/workspace?action=preview', {
    headers: { ...origin, 'Content-Type': 'application/octet-stream' },
    data: Buffer.alloc(32 * 1024 * 1024 + 1),
  });
  expect(tooLarge.status()).toBe(400);
  expect(await (await request.get('/api/tracker')).json()).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('CPU inference guidance, double-click prevention and timeout recovery — mocked boundary only', async ({
  page,
  request,
}) => {
  const state = await (await request.get('/api/tracker')).json();
  const job = state.jobs.find((j: { position: string }) => j.position === 'Evidence Engineer');
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>((accept) => {
    finish = accept;
  });
  await page.route('**/api/tracker', async (route) => {
    if (route.request().postDataJSON()?.action !== 'extract') return route.continue();
    calls++;
    await pending;
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Local inference timed out after 300 seconds. No extraction was saved.',
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: job.position, exact: true }).click();
  const requirements = page.getByRole('tab', { name: 'Requirements', exact: true });
  await requirements.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Fit comparison', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Fit comparison' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tabpanel', { name: 'Description' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(requirements).toBeFocused();
  await expect(page.getByText(/Local CPU inference often takes tens of seconds/)).toBeVisible();
  const button = page.getByRole('button', { name: 'Re-extract with Ollama', exact: true });
  await button.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect.poll(() => calls).toBe(1);
  await expect(
    page.getByRole('button', { name: 'Extracting locally… (up to 5 min)', exact: true }),
  ).toBeDisabled();
  finish();
  await expect(
    page.getByRole('alert').filter({ hasText: 'timed out after 300 seconds' }),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  expect((await (await request.get('/api/tracker?id=' + job.id)).json()).job.extraction).toEqual(
    job.extraction,
  );
  expect(calls).toBe(1);
});
