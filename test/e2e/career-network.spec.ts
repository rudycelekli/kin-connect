import { test, expect, type Page } from '@playwright/test';
test.setTimeout(90_000);

async function joinWithGoal(page: Page, alias: string, goal: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await page.getByRole('button', { name: 'Edit my agent', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('textbox', { name: /^Add your own interest/ }).fill(goal);
  await page.getByRole('button', { name: 'Add interest', exact: true }).click();
  for (let step = 0; step < 3; step++)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Save my agent', exact: true }).click();
  await page.getByRole('button', { name: 'Live network', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your agent’s public alias', exact: false }).fill(alias);
  await page
    .getByRole('textbox', { name: 'Relay address', exact: false })
    .fill('http://127.0.0.1:4318');
  await page.getByRole('button', { name: 'Friendship', exact: true }).click();
  await page.getByRole('button', { name: 'Dating', exact: true }).click();
  // Goal stays out of the public capsule: encrypted cards can still compare it.
  await page.getByRole('checkbox', { name: /I choose to publish this capsule/ }).check();
  await page.getByRole('button', { name: 'Join the real network', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leave network', exact: true })).toBeVisible();
}

test('private complementary career goals produce a live mentorship beginning without granting consent', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all([
    browser.newContext(testInfo.project.use),
    browser.newContext(testInfo.project.use),
  ]);
  const first = await contexts[0].newPage(),
    second = await contexts[1].newPage();
  const alias = `Career peer ${Date.now().toString(36)} ${testInfo.project.name}`;
  const bodies: string[] = [];
  first.on('request', (request) => {
    if (request.url().endsWith('/api/network/messages')) bodies.push(request.postData() || '');
  });
  try {
    await joinWithGoal(first, `Career owner ${Date.now().toString(36)}`, 'Career: find a mentor');
    await joinWithGoal(second, alias, 'Career: offer mentorship');
    await first.getByRole('button', { name: 'Refresh network', exact: true }).click();
    const card = first
      .locator('.kn-peer-card')
      .filter({ has: first.getByRole('heading', { name: alias, exact: true }) });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('Career: offer mentorship');
    await card.getByRole('button', { name: 'Let our agents talk', exact: true }).click();
    for (const page of [first, second]) {
      await expect(
        page.getByRole('heading', { name: 'Your agents found a beginning.', exact: true }),
      ).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('.kn-agent-step')).toHaveCount(6);
      await expect(page.locator('.kn-meeting-plan').first()).toContainText(/mentor/i);
      await expect(page.locator('.kn-meeting-plan').first()).toContainText('both approve');
      await expect(
        page.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
      ).toHaveCount(0);
    }
    expect(bodies.length).toBeGreaterThanOrEqual(3);
    expect(
      bodies.every(
        (body) =>
          !body.includes('Career: find a mentor') &&
          !body.includes('Career: offer mentorship') &&
          !body.includes('"card"'),
      ),
    ).toBe(true);
    await first.getByRole('button', { name: 'Leave network', exact: true }).click();
    await second.getByRole('button', { name: 'Leave network', exact: true }).click();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
