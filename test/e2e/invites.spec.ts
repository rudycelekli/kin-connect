import { test, expect, type Page } from '@playwright/test';

function invitePath(relay: string) {
  return `/?kin=network&relay=${encodeURIComponent(relay)}`;
}

async function demoProfile(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
}

function networkRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/network/')) requests.push(request.url());
  });
  return requests;
}

async function expectNoPublication(page: Page, requests: string[]) {
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('kin-network-identity-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('kin-network-relays-v1'))).toBeNull();
}

for (const relay of [
  { input: 'https://Relay.Example.Test/', normalized: 'https://relay.example.test' },
  { input: 'http://127.0.0.1:4318/', normalized: 'http://127.0.0.1:4318' },
]) {
  test(`reviewed ${new URL(relay.input).protocol} invite prefills its address without contacting or joining the relay`, async ({
    page,
  }) => {
    await demoProfile(page);
    const requests = networkRequests(page);
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://127.0.0.1:5173')
        externalRequests.push(request.url());
    });
    await page.goto(invitePath(relay.input));
    await expect(page.getByText('Network invite', { exact: true })).toBeVisible();
    await expect(page.getByText(/Review this network address/)).toContainText(relay.normalized);
    await expect(page.getByRole('textbox', { name: /^Relay address/ })).toHaveValue(
      relay.normalized,
    );
    await expect(
      page.getByRole('checkbox', { name: /I choose to publish this capsule/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Join the real network', exact: true }),
    ).toBeDisabled();
    await expectNoPublication(page, requests);
    expect(externalRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

for (const invalid of [
  {
    label: 'duplicate relay parameters',
    path: `${invitePath('https://relay.example.test')}&relay=${encodeURIComponent('https://other.example.test')}`,
  },
  {
    label: 'a credentialed relay URL',
    path: invitePath('https://owner:secret@relay.example.test'),
  },
]) {
  test(`rejects ${invalid.label} without retaining a trusted default or contacting a relay`, async ({
    page,
  }) => {
    await demoProfile(page);
    const requests = networkRequests(page);
    await page.goto(invalid.path);
    await expect(page.getByText('This network invite is invalid.', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Relay address/ })).toHaveValue('');
    await expect(page.getByText('Network invite', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Join the real network', exact: true }),
    ).toBeDisabled();
    await expectNoPublication(page, requests);
  });
}

test('a fresh invite opens private intake without registration or contacting the chosen relay', async ({
  page,
}) => {
  const requests = networkRequests(page);
  await page.goto(invitePath('https://relay.example.test'));
  await expect(page.getByText('Network invite', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Start with someone in your corner.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create my agent', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little about you.', exact: true }),
  ).toBeVisible();
  await expectNoPublication(page, requests);
});

test('a local invite lets a fresh recipient review intake before joining the same network', async ({
  page,
  browser,
}, testInfo) => {
  await demoProfile(page);
  await page.goto(invitePath('http://127.0.0.1:4318'));
  const alias = `Invite ${Date.now().toString(36)} ${testInfo.project.name}`;
  await page.getByRole('textbox', { name: /^Your agent’s public alias/ }).fill(alias);
  await page.getByRole('checkbox', { name: /I choose to publish this capsule/ }).check();
  await page.getByRole('button', { name: 'Join the real network', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leave network', exact: true })).toBeVisible();
  const recipientContext = await browser.newContext(testInfo.project.use);
  const recipient = await recipientContext.newPage();
  try {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { __kinInviteCopy?: string }).__kinInviteCopy = value;
          },
        },
      });
    });
    await page.getByRole('button', { name: 'Copy network invite', exact: true }).click();
    const copied = await page.evaluate(
      () => (window as Window & { __kinInviteCopy?: string }).__kinInviteCopy,
    );
    expect(copied).toBeTruthy();
    const link = new URL(copied!);
    expect(link.origin).toBe('http://127.0.0.1:4318');
    expect(link.pathname).toBe('/');
    expect([...link.searchParams.keys()].sort()).toEqual(['kin', 'relay']);
    expect(link.searchParams.get('kin')).toBe('network');
    expect(link.searchParams.get('relay')).toBe('http://127.0.0.1:4318');
    expect(link.hash).toBe('');
    expect(copied).not.toContain(alias);

    // Follow the actual copied link against the built app, rather than only checking its text.
    const requests = networkRequests(recipient);
    await recipient.goto(copied!);
    await expect(recipient.getByText('Network invite', { exact: true })).toBeVisible();
    await expect(
      recipient.getByRole('heading', { name: 'Start with someone in your corner.', exact: true }),
    ).toBeVisible();
    await expectNoPublication(recipient, requests);
    await recipient.getByRole('button', { name: 'Create my agent', exact: true }).click();
    await recipient.getByRole('textbox', { name: /^Your name/ }).fill('Fictional invite recipient');
    await recipient.getByRole('spinbutton', { name: 'Your age', exact: true }).fill('29');
    await recipient.getByRole('textbox', { name: /^Your city/ }).fill('New York');
    await recipient.getByRole('button', { name: 'Continue', exact: true }).click();
    await recipient.getByRole('button', { name: 'Books', exact: false }).click();
    await recipient.getByRole('button', { name: 'Coffee', exact: false }).click();
    await recipient.getByRole('button', { name: 'Continue', exact: true }).click();
    await recipient.getByRole('button', { name: 'Kindness', exact: false }).click();
    await recipient.getByRole('button', { name: 'Continue', exact: true }).click();
    await recipient.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      recipient.getByText('Review your public capsule before joining', { exact: false }),
    ).toBeVisible();
    await recipient.getByRole('button', { name: 'Let’s find my people', exact: true }).click();
    await expect(recipient.getByRole('textbox', { name: /^Relay address/ })).toHaveValue(
      'http://127.0.0.1:4318',
    );
    await expect(
      recipient.getByRole('checkbox', { name: /I choose to publish this capsule/ }),
    ).not.toBeChecked();
    await expect(
      recipient.getByRole('button', { name: 'Join the real network', exact: true }),
    ).toBeDisabled();
    await expectNoPublication(recipient, requests);
    const recipientAlias = `${alias} recipient`;
    await recipient
      .getByRole('textbox', { name: /^Your agent’s public alias/ })
      .fill(recipientAlias);
    await recipient.getByRole('checkbox', { name: /I choose to publish this capsule/ }).check();
    await recipient.getByRole('button', { name: 'Join the real network', exact: true }).click();
    await expect(
      recipient.getByRole('button', { name: 'Leave network', exact: true }),
    ).toBeVisible();
    expect(requests.some((url) => url.endsWith('/api/network/register'))).toBe(true);
    await page.getByRole('button', { name: 'Refresh network', exact: true }).click();
    await expect(
      page.locator('.kn-peer-card').getByRole('heading', { name: recipientAlias, exact: true }),
    ).toBeVisible();
    await recipient.getByRole('button', { name: 'Leave network', exact: true }).click();
    await expect(
      recipient.getByRole('button', { name: 'Join the real network', exact: true }),
    ).toBeVisible();
  } finally {
    try {
      if (await recipient.getByRole('button', { name: 'Leave network', exact: true }).isVisible())
        await recipient.getByRole('button', { name: 'Leave network', exact: true }).click();
      await page.getByRole('button', { name: 'Leave network', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Join the real network', exact: true }),
      ).toBeVisible();
    } finally {
      await recipientContext.close();
    }
  }
});
