import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function demoCircles(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Circles', exact: true }).click();
}

test('fictional circle requires owner review and separate organizer approval, then supports withdrawal', async ({
  page,
}) => {
  const outsideWrites: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      !new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)
    )
      outsideWrites.push(request.url());
  });
  await demoCircles(page);
  await expect(
    page.getByRole('heading', { name: 'A place to belong.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.kc-card')).toHaveCount(4);
  await expect(page.getByText('Fictional circles · local demo', { exact: true })).toBeVisible();
  const coffee = page
    .locator('.kc-card')
    .filter({ has: page.getByRole('heading', { name: 'Brooklyn Coffee Circle', exact: true }) });
  await coffee.getByRole('button', { name: 'Review circle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Your agent’s policy checks', exact: true }),
  ).toBeVisible();
  await expect(dialog.locator('.kc-policy-message')).toHaveCount(4);
  await expect(
    dialog.getByRole('button', { name: 'Apply to this circle', exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator('.kc-disclosures')).toContainText('Nova');
  await expect(dialog.locator('.kc-disclosures')).toContainText('New York');
  await expect(dialog.locator('.kc-disclosures')).not.toContainText('Alex');
  await dialog
    .getByRole('checkbox', { name: 'I want to apply and share only this capsule.', exact: true })
    .check();
  await dialog.getByRole('button', { name: 'Apply to this circle', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Your application is in.', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Two choices. A shared beginning.', exact: true }),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Simulate organizer approval', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Two choices. A shared beginning.', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/no live membership or group chat/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Withdraw demo membership', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Apply to this circle', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(coffee).toContainText('Application withdrawn');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(outsideWrites).toEqual([]);
});

test('credential-required and paid circles fail closed without verification or billing', async ({
  page,
}) => {
  await demoCircles(page);
  for (const name of ['Founders Table', 'Members Club']) {
    await page
      .locator('.kc-card')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
      .getByRole('button', { name: 'Review circle', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', {
        name: 'This circle can’t accept your application.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Application unavailable', exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Simulate organizer approval', exact: true }),
    ).toHaveCount(0);
    await expect(dialog.locator('.kc-check-list .failed')).not.toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close circle review', exact: true }).click();
  }
});
