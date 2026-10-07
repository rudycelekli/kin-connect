import { test, expect } from '@playwright/test';

test('paired assistant changes require owner review and deletion revokes its capability', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await page.getByRole('button', { name: 'Connect my agent', exact: true }).click();
  await page.getByRole('button', { name: 'Review assistant changes', exact: true }).click();
  await expect(
    page.getByText('No assistant changes to review yet.', { exact: true }),
  ).toBeVisible();
  const configuration = JSON.parse(
    (await page.getByLabel('Private agent connection configuration').textContent()) ?? '{}',
  );
  const token = configuration.mcpServers.kin.env.KIN_CONNECTION_TOKEN as string;
  const headers = { Authorization: `Bearer ${token}` };
  const state = await (await request.get('http://127.0.0.1:4318/api/session', { headers })).json();
  const profile = {
    ...state.profile,
    name: 'Reviewed Robin',
    requirements: { ...state.profile.requirements, minAge: 26 },
  };
  expect(
    (await request.put('http://127.0.0.1:4318/api/profile', { headers, data: profile })).ok(),
  ).toBe(true);
  await expect(page.getByText('Reviewed Robin', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Review assistant changes', exact: true }).click();
  await expect(page.getByLabel('Assistant profile changes')).toContainText('Reviewed Robin');
  await page.getByRole('button', { name: 'Use these preferences', exact: true }).click();
  await expect(page.locator('.agent-profile-panel .eyebrow')).toContainText('REVIEWED ROBIN');
  await page.getByRole('button', { name: 'Delete my data', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete my data', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeVisible();
  expect((await request.get('http://127.0.0.1:4318/api/session', { headers })).status()).toBe(401);
});
