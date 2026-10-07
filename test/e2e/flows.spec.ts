import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('fictional demo, agent conversation, explicit two-sided consent and modes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your people are out there.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('.match-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Read the agent conversation' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Agent conversation', exact: true }).click();
  await expect(dialog.locator('.agent-message')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Approve introduction', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Your yes is in.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Simulate their approval' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Two yeses. One good beginning.' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Dating', exact: true }).click();
  await expect(page.locator('.match-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'Collaboration', exact: true }).click();
  await expect(page.locator('.match-card').first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('owner interview validates, saves optional biography, edits and deletes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meet your agent', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Give us a name to call you.')).toBeVisible();
  await page.getByRole('textbox', { name: /^Your name/ }).fill('Robin');
  await page.getByRole('spinbutton', { name: 'Your age', exact: true }).fill('29');
  await page.getByRole('textbox', { name: /^Your city/ }).fill('New York');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Books', exact: false }).click();
  await page.getByRole('button', { name: 'Coffee', exact: false }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Kindness', exact: false }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s find my people' }).click();
  await expect(page.getByRole('heading', { name: 'Your people are out there.' })).toBeVisible();
  await expect(page.locator('.match-card').first()).toBeVisible();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meet your better beginning.' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause my agent' }).click();
  await expect(page.getByRole('button', { name: 'Resume agent' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume agent' }).click();
  await page.getByRole('button', { name: 'Delete my data', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete my data', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeVisible();
});

test('landing and match dialog meet automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your people are out there.' })).toBeVisible();
  const landing = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    landing.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Read the agent conversation' }).first().click();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    dialog.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});
