import { expect, test } from '@playwright/test';
import { fixtures, syntheticResume } from '../fixtures/jobs';

test('complete local journey: CSV, duplicate review, profile, fit, tracking, drafts, export and persistence', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your next chapter starts here' })).toBeVisible();
  await page.getByRole('button', { name: 'Load 20 synthetic jobs' }).click();
  await expect(page.getByRole('button', { name: 'Frontend Engineer', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Load synthetic examples' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '20 exact duplicates skipped' }),
  ).toBeVisible();

  // Import a real CSV through the UI (committed fixture data, never personal data).
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page
    .getByLabel('Or paste CSV')
    .fill(
      'company,position,location,employmentType,description,synthetic\nCSV Example Studio,Product Engineer,Remote,Contract,"SYNTHETIC: Required skills: TypeScript, React. Build useful web tools.",true',
    );
  await page.getByRole('button', { name: 'Validate & import' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(21);

  await page.getByRole('button', { name: 'Add opportunity', exact: true }).click();
  await page.getByLabel('Company', { exact: true }).fill('Manual Example Works');
  await page.getByLabel('Position', { exact: true }).fill('Local Tools Engineer');
  await page.getByLabel('Location', { exact: true }).fill('Remote');
  await page
    .getByLabel('Job description', { exact: true })
    .fill(
      'SYNTHETIC MANUAL EXAMPLE. Required skills: React, TypeScript. Preferred skills: Playwright. Build accessible local tools.',
    );
  await page.getByLabel('This is synthetic sample data').check();
  await page.getByRole('button', { name: 'Save opportunity', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Local Tools Engineer', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit job', exact: true }).click();
  await page.getByLabel('Salary (optional)').fill('Illustrative $90,000');
  await page.getByRole('button', { name: 'Save opportunity', exact: true }).click();
  await expect(page.getByText('Illustrative $90,000', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Use synthetic résumé', exact: true }).click();
  await page.getByRole('button', { name: 'Extract skill evidence', exact: false }).click();
  await expect(page.getByLabel('Skill name', { exact: true }).first()).toHaveValue(/\w/);
  await expect(
    page.getByLabel('Skill name', { exact: true }).filter({ visible: true }),
  ).not.toHaveCount(0);
  await page.getByLabel('I reviewed the evidence and confirm this profile is accurate.').check();
  await page.getByRole('button', { name: 'Save verified profile', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Verified profile saved locally' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Opportunities', exact: false }).first().click();
  await page.getByRole('button', { name: 'Local Tools Engineer', exact: true }).click();
  await page.getByRole('button', { name: 'Review / enter requirements', exact: true }).click();
  for (const [index, term, kind, priority, evidence] of [
    [1, 'React', 'skill', 'required', 'Required skills: React, TypeScript.'],
    [2, 'TypeScript', 'technology', 'required', 'Required skills: React, TypeScript.'],
    [3, 'Playwright', 'technology', 'preferred', 'Preferred skills: Playwright.'],
  ] as const) {
    await page.getByRole('button', { name: 'Add requirement', exact: true }).click();
    const row = page.getByRole('group', { name: `Requirement ${index}`, exact: true });
    await row.getByLabel('Requirement name').fill(term);
    await row.getByLabel('Kind', { exact: true }).selectOption(kind);
    await row.getByLabel('Priority', { exact: true }).selectOption(priority);
    await row.getByLabel('Exact job quote').fill(evidence);
  }
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(page.getByText('Human-entered / corrected · not live AI')).toBeVisible();
  await page.getByRole('tab', { name: 'Fit comparison', exact: true }).click();
  await expect(page.getByText('7 of 7 weighted points', { exact: true })).toBeVisible();
  await expect(page.getByText('3 matched · 0 missing · 0 unknown', { exact: true })).toBeVisible();

  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Applied');
  await page.getByLabel('Application date', { exact: true }).fill('2026-11-15');
  await page.getByLabel('Follow-up date', { exact: true }).fill('2026-11-15');
  await page
    .getByLabel('Private notes', { exact: true })
    .fill('Synthetic test note. Follow up manually.');
  await page.getByRole('button', { name: 'Save progress', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Application progress saved' }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Create tailored draft', exact: true }).click();
  await expect(page.getByLabel('Cover note', { exact: true })).toHaveValue(/React/);
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toBeDisabled();
  await page.getByLabel('I reviewed this draft and confirm every claim is accurate.').check();
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Copy approved draft', exact: true }),
  ).toBeEnabled();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy approved draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved draft copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('React');
  await page.reload();
  await page.getByRole('button', { name: 'Local Tools Engineer', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('Applied');
  await expect(page.getByLabel('Private notes', { exact: true })).toHaveValue(
    'Synthetic test note. Follow up manually.',
  );
  await page.getByRole('tab', { name: 'Drafts', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Copy approved draft', exact: true }),
  ).toBeEnabled();

  // Persisted server state, export and local-only API guard.
  const state = await (await request.get('/api/tracker')).json();
  expect(state.jobs).toHaveLength(22);
  expect(state.profile.resume).toBe(syntheticResume);
  const manual = state.jobs.find((j: { company: string }) => j.company === 'Manual Example Works');
  const duplicate = await request.post('/api/tracker', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { action: 'add', job: { ...fixtures[0], company: 'NORTHSTAR LABS' } },
  });
  expect(duplicate.status()).toBe(409);
  const denied = await request.post('/api/tracker', {
    headers: { Origin: 'https://untrusted.example' },
    data: { action: 'delete', id: manual.id, confirmed: true },
  });
  expect(denied.status()).toBe(400);
  const exportResponse = await request.get('/api/tracker?export=1');
  expect(exportResponse.headers()['content-type']).toContain('text/csv');
  expect(await exportResponse.text()).toContain('Synthetic test note');

  await page.getByRole('button', { name: 'Back to opportunities', exact: true }).click();
  await page.getByRole('button', { name: 'Frontend Engineer', exact: true }).click();
  await expect(page.getByText('Possible duplicate — review before applying')).toBeVisible();
  await page.getByRole('button', { name: 'Keep both', exact: true }).click();
  await expect(page.getByText('Possible duplicate — review before applying')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to opportunities', exact: true }).click();
  await page.getByLabel('Search opportunities').fill('CSV Example');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Product Engineer', exact: true }).click();
  await page.getByRole('button', { name: 'Delete opportunity', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product Engineer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete opportunity', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm permanent deletion', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No opportunities match this view' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('review forms require real evidence and explicit years, preserve unsaved decisions, and work by keyboard', async ({
  page,
  request,
}, testInfo) => {
  const origin = { Origin: 'http://127.0.0.1:3100' };
  const description =
    'SYNTHETIC REVIEW FORM. Required: 4 years of Python experience. Docker is preferred. Review pull requests.';
  const added = await request.post('/api/tracker', {
    headers: origin,
    data: {
      action: 'add',
      job: {
        ...fixtures[0],
        company: 'Form Review Example',
        position: 'Evidence Engineer',
        sourceUrl: '',
        description,
      },
    },
  });
  expect(added.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Evidence Engineer', exact: true }).click();
  await page.getByRole('button', { name: 'Review / enter requirements', exact: true }).click();
  const add = page.getByRole('button', { name: 'Add requirement', exact: true });
  await add.focus();
  await page.keyboard.press('Enter');
  const row = page.getByRole('group', { name: 'Requirement 1', exact: true });
  await row.getByLabel('Requirement name').fill('Python');
  await page.keyboard.press('Tab');
  await expect(row.getByLabel('Kind', { exact: true })).toBeFocused();
  await row.getByLabel('Kind', { exact: true }).selectOption('experience');
  await row.getByLabel('Priority', { exact: true }).selectOption('required');
  await expect(row.getByLabel('Minimum years (optional)')).toHaveValue('');
  await row.getByLabel('Minimum years (optional)').fill('4');
  await expect(row.getByLabel('Kind', { exact: true })).toBeDisabled();
  await row.getByLabel('Exact job quote').fill('Required: 4 years of Python experience.');
  await page.screenshot({ path: testInfo.outputPath('review-requirements.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save human review', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Human-reviewed requirements saved' }),
  ).toBeVisible();
  let state = await (await request.get('/api/tracker')).json();
  const saved = state.jobs.find((j: { position: string }) => j.position === 'Evidence Engineer');
  expect(saved.extraction.requirements[0]).toMatchObject({ kind: 'experience', minYears: 4 });
  await page.getByRole('button', { name: 'Review / enter requirements', exact: true }).click();
  await row.getByLabel('Minimum years (optional)').fill('');
  await expect(row.getByLabel('Kind', { exact: true })).toBeEnabled();
  await row.getByLabel('Kind', { exact: true }).selectOption('skill');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  state = await (await request.get('/api/tracker')).json();
  expect(state.jobs.find((j: { id: string }) => j.id === saved.id).extraction).toEqual(
    saved.extraction,
  );

  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await page.getByRole('button', { name: 'Use synthetic résumé', exact: true }).click();
  const resume =
    'SYNTHETIC PROFILE: I have 4 years of Python experience. I use Docker to maintain example applications.';
  await page.getByLabel('Your résumé', { exact: true }).fill(resume);
  await page.getByRole('button', { name: 'Add skill', exact: true }).click();
  const skill = page.getByRole('group', { name: 'Skill 1', exact: true });
  await skill.getByLabel('Skill name').fill('Docker');
  await skill
    .getByLabel('Exact résumé quote')
    .fill('I use Docker to maintain example applications.');
  const confirmation = page.getByLabel(
    'I reviewed the evidence and confirm this profile is accurate.',
  );
  await confirmation.check();
  await page.getByRole('button', { name: 'Add experience', exact: true }).click();
  await expect(confirmation).not.toBeChecked();
  const experience = page.getByRole('group', { name: 'Experience 1', exact: true });
  await experience.getByLabel('Experience area').fill('Python');
  await experience.getByLabel('Exact résumé quote').fill('I have 4 years of Python experience.');
  await expect(experience.getByLabel('Explicit years')).toHaveValue('');
  await confirmation.check();
  await page.getByRole('button', { name: 'Save verified profile', exact: true }).click();
  await expect(experience.getByLabel('Explicit years')).toBeFocused();
  await experience.getByLabel('Explicit years').fill('5');
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await page.getByRole('button', { name: 'Save verified profile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'explicit years' })).toBeVisible();
  state = await (await request.get('/api/tracker')).json();
  expect(state.profile.resume).not.toBe(resume);
  await experience.getByLabel('Explicit years').fill('4');
  await confirmation.check();
  await page.getByRole('button', { name: 'Save verified profile', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Verified profile saved locally' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My profile', exact: true }).click();
  await expect(experience.getByLabel('Explicit years')).toHaveValue('4');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('review-profile-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove skill 1', exact: true }).click();
  await expect(skill).toHaveCount(0);
  await expect(experience.getByLabel('Explicit years')).toHaveValue('4');
  await expect(confirmation).not.toBeChecked();
});

test('malformed model failure is visible and narrow layouts remain usable', async ({
  page,
  request,
}) => {
  const added = await request.post('/api/tracker', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      action: 'add',
      job: {
        ...fixtures[0],
        company: 'Mobile Scenario Studio',
        position: 'Mobile Engineer',
        sourceUrl: 'https://example.com/mobile-test',
      },
    },
  });
  expect(added.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mobile Engineer', exact: true }).click();
  // Deliberately intercept the boundary; this browser test does not claim live inference.
  await page.route('**/api/tracker', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === 'extract')
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Ollama returned malformed output. No extraction was saved.',
        }),
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Extract with Ollama', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Ollama returned malformed output' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Edit job', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
