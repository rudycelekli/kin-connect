import { test, expect } from '@playwright/test';

test('custom interests are reviewed, reject contact labels, persist and export privately in embedded mode', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await page.getByRole('button', { name: 'Edit my agent', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const input = page.getByRole('textbox', { name: /^Add your own interest/ });
  await input.fill('AI ethics');
  await page.getByRole('button', { name: 'Add interest', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove interest AI ethics', exact: true }),
  ).toBeVisible();
  await input.fill('ai  ethics');
  await page.getByRole('button', { name: 'Add interest', exact: true }).click();
  await expect(page.getByText('This interest is already selected.', { exact: true })).toBeVisible();
  await input.fill('person@example.com');
  await page.getByRole('button', { name: 'Add interest', exact: true }).click();
  await expect(page.locator('#error-customInterest')).toContainText(/contact|email|phone/i);
  await input.fill('');
  for (let step = 0; step < 3; step++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save my agent', exact: true }).click();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await expect(
    page.locator('.agent-details-grid').getByText('AI ethics', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await expect(
    page.locator('.agent-details-grid').getByText('AI ethics', { exact: true }),
  ).toBeVisible();
  // Exercise the sandbox-safe export UI without claiming an actual ChatGPT account test.
  await page.evaluate(() => {
    window.__KIN_WIDGET__ = true;
  });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' || request.method() === 'PUT') mutations.push(request.url());
  });
  await page.getByRole('button', { name: 'Export my profile', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Your private Kin export', exact: true });
  const exported = JSON.parse(
    await dialog
      .getByRole('textbox', { name: 'Your private export JSON', exact: true })
      .inputValue(),
  );
  expect(exported.profile.interests).toContain('AI ethics');
  expect(exported.profile.interests).not.toContain('person@example.com');
  await dialog.getByRole('button', { name: 'Select export text', exact: true }).click();
  expect(
    await dialog
      .getByRole('textbox')
      .evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart),
  ).toBeGreaterThan(100);
  expect(mutations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
