import { test, expect as baseExpect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { NetworkInbox } from '../../src/shared/network-types';
const expect = baseExpect.configure({ timeout: 25_000 });
test.setTimeout(90_000);

async function join(page: Page, alias: string) {
  await page.goto('/');
  const demo = page.getByRole('button', { name: 'Try the demo', exact: true });
  if (await demo.count()) await demo.click();
  await page.getByRole('button', { name: 'Live network', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your agent’s public alias', exact: false }).fill(alias);
  await page
    .getByRole('textbox', { name: 'Relay address', exact: false })
    .fill('http://127.0.0.1:4318');
  await page.getByRole('checkbox', { name: /I choose to publish this capsule/ }).check();
  await page.getByRole('button', { name: 'Join the real network', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leave network', exact: true })).toBeVisible();
}
async function cleanAxe(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
}

test('two independent real agents negotiate privately, owners consent, encrypted chat opens and block revokes it', async ({
  browser,
}, testInfo) => {
  const firstContext = await browser.newContext(testInfo.project.use);
  const secondContext = await browser.newContext(testInfo.project.use);
  const first = await firstContext.newPage(),
    second = await secondContext.newPage();
  const suffix = `${Date.now().toString(36)}-${testInfo.project.name}`;
  const firstAlias = `Clover ${suffix}`,
    secondAlias = `Orbit ${suffix}`;
  const outgoingBodies: string[] = [];
  const errors: string[] = [];
  for (const page of [first, second]) {
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/api/network/messages'))
        outgoingBodies.push(request.postData() || '');
    });
  }
  try {
    await first.goto('/');
    await first.getByRole('button', { name: 'Try the demo', exact: true }).click();
    await first.getByRole('button', { name: 'Live network', exact: true }).click();
    await cleanAxe(first);
    await join(first, firstAlias);
    await join(second, secondAlias);
    await first.getByRole('button', { name: 'Refresh network', exact: true }).click();
    const other = first
      .locator('.kn-peer-card')
      .filter({ has: first.getByRole('heading', { name: secondAlias, exact: true }) });
    await expect(other).toBeVisible();
    await cleanAxe(first);
    await other.getByRole('button', { name: 'Let our agents talk', exact: true }).click();
    for (const page of [first, second]) {
      await expect(
        page.getByRole('heading', { name: 'Your agents found a beginning.', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.kn-agent-step')).toHaveCount(6);
      await expect(page.locator('[aria-label="A beginning to explore"]')).toBeVisible();
      await expect(page.locator('[aria-label="A beginning to explore"]')).toContainText(
        'not a prediction of chemistry or success',
      );
      await expect(
        page.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
      ).toHaveCount(0);
    }
    await first.getByRole('checkbox', { name: 'I want this introduction.', exact: true }).check();
    await first.getByRole('button', { name: 'Approve introduction', exact: true }).click();
    await expect(
      first.getByRole('button', { name: 'Waiting for their yes', exact: true }),
    ).toBeDisabled();
    await expect(
      first.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
    ).toHaveCount(0);
    await expect(
      second.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
    ).toHaveCount(0);
    for (const page of [first, second])
      await expect(
        page.getByRole('button', { name: 'Save to my private circle', exact: true }),
      ).toHaveCount(0);
    await second.getByRole('checkbox', { name: 'I want this introduction.', exact: true }).check();
    await second.getByRole('button', { name: 'Approve introduction', exact: true }).click();
    for (const page of [first, second])
      await expect(
        page.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
      ).toBeVisible();
    await first.getByRole('button', { name: 'Save to my private circle', exact: true }).click();
    await first.getByRole('button', { name: 'Circles', exact: true }).click();
    await expect(
      first.getByRole('heading', { name: 'Your private circle', exact: true }),
    ).toBeVisible();
    await expect(
      first.locator('.kc-saved-list').getByRole('heading', { name: secondAlias, exact: true }),
    ).toBeVisible();
    await expect(
      first
        .locator('.kc-saved-list')
        .getByRole('button', { name: `Remove saved connection with ${secondAlias}`, exact: true }),
    ).toBeVisible();
    await first.getByRole('button', { name: 'Live network', exact: true }).click();
    const privateHello = `A private hello from two consenting people ${suffix}`;
    await first
      .getByRole('textbox', { name: 'Your encrypted message', exact: true })
      .fill(privateHello);
    const packetResponse = first.waitForResponse(
      (response) =>
        response.url().endsWith('/api/network/messages') &&
        response.request().postDataJSON()?.payload?.kind === 'chat',
    );
    await first.getByRole('button', { name: 'Send encrypted message', exact: true }).click();
    const replayPacket = await (await packetResponse).json();
    await expect(
      second.locator('.kn-chat-bubble').getByText(privateHello, { exact: true }),
    ).toBeVisible();
    expect(outgoingBodies.length).toBeGreaterThanOrEqual(7);
    expect(
      outgoingBodies.every(
        (body) =>
          !body.includes(privateHello) &&
          !body.includes('"card"') &&
          !body.includes('"requirements"'),
      ),
    ).toBe(true);
    for (const body of outgoingBodies) {
      const payload = JSON.parse(body).payload;
      expect(payload.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(payload.iv).toHaveLength(16);
      expect(Object.keys(payload).sort()).toEqual(['ciphertext', 'conversationId', 'iv', 'kind']);
    }
    // A relay can re-ID valid ciphertext; the encrypted sender messageId prevents duplicate display.
    let replayed = false;
    await second.route('**/api/network/inbox', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (!replayed) {
        body.packets.push({ ...replayPacket, id: crypto.randomUUID() });
        replayed = true;
      }
      await route.fulfill({ response, json: body });
    });
    await second.getByRole('button', { name: 'Refresh network', exact: true }).click();
    await expect.poll(() => replayed).toBe(true);
    await expect(
      second.locator('.kn-chat-bubble').getByText(privateHello, { exact: true }),
    ).toHaveCount(1);
    await second.unroute('**/api/network/inbox');
    await cleanAxe(first);
    await cleanAxe(second);
    // Hold a genuine pre-block inbox, including both valid signed approvals. The owner's
    // local block must survive its late arrival and further replay, even if the block POST fails.
    let capturedInbox: NetworkInbox | undefined;
    let releaseInbox!: () => void;
    const delayedInbox = new Promise<void>((resolve) => {
      releaseInbox = resolve;
    });
    let staleDeliveries = 0;
    await first.route('**/api/network/inbox', async (route) => {
      if (!capturedInbox) {
        const response = await route.fetch();
        capturedInbox = await response.json();
        await delayedInbox;
      }
      staleDeliveries += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', json: capturedInbox });
    });
    await first.getByRole('button', { name: 'Refresh network', exact: true }).click();
    await expect
      .poll(() =>
        capturedInbox?.conversations.some((conversation) => conversation.state === 'connected'),
      )
      .toBe(true);
    const connectedBeforeBlock = capturedInbox!.conversations.find(
      (conversation) => conversation.state === 'connected',
    )!;
    expect(Object.keys(connectedBeforeBlock.decisionAttestations ?? {})).toHaveLength(2);
    const messagesBeforeBlock = outgoingBodies.length;
    await first.route('**/api/network/decisions', (route) => {
      if (route.request().postDataJSON()?.payload?.decision === 'block')
        return route.abort('connectionfailed');
      return route.continue();
    });
    await first.getByRole('button', { name: 'Block this agent', exact: true }).click();
    await expect(
      first.getByRole('heading', { name: 'This agent is blocked.', exact: true }),
    ).toBeVisible();
    await expect(first.getByRole('alert')).toContainText(
      'This introduction stays closed on your device.',
    );
    await expect(
      first.getByRole('button', { name: 'Retry blocking this agent', exact: true }),
    ).toBeVisible();
    releaseInbox();
    await expect.poll(() => staleDeliveries).toBeGreaterThanOrEqual(1);
    await expect(first.getByRole('button', { name: 'Refresh network', exact: true })).toBeEnabled();
    await first.getByRole('button', { name: 'Refresh network', exact: true }).click();
    await expect.poll(() => staleDeliveries).toBeGreaterThanOrEqual(2);
    await expect(
      first.getByRole('heading', { name: 'This agent is blocked.', exact: true }),
    ).toBeVisible();
    await expect(
      first.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
    ).toHaveCount(0);
    await expect(
      first.getByRole('button', { name: 'Save to my private circle', exact: true }),
    ).toHaveCount(0);
    await expect(
      first.getByRole('log', { name: 'Encrypted human conversation', exact: true }),
    ).toHaveCount(0);
    expect(outgoingBodies).toHaveLength(messagesBeforeBlock);
    await first.unroute('**/api/network/decisions');
    await first.getByRole('button', { name: 'Retry blocking this agent', exact: true }).click();
    await expect
      .poll(() =>
        first.evaluate(
          () => JSON.parse(localStorage.getItem('kin-local-demo-v1') || '{}').savedConnections,
        ),
      )
      .toEqual([]);
    for (const page of [first, second]) {
      await expect(
        page.getByRole('heading', { name: 'This agent is blocked.', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
      ).toHaveCount(0);
      await expect(page.locator('[aria-label="A beginning to explore"]')).toHaveCount(0);
    }
    await first.getByRole('button', { name: 'Refresh network', exact: true }).click();
    await expect.poll(() => staleDeliveries).toBeGreaterThanOrEqual(3);
    await expect(
      first.getByRole('textbox', { name: 'Your encrypted message', exact: true }),
    ).toHaveCount(0);
    await expect(
      first.getByRole('button', { name: 'Save to my private circle', exact: true }),
    ).toHaveCount(0);
    // A real signed request cannot bypass the honest relay's pair block either.
    const blockedSend = await first.evaluate(async (packet) => {
      const clientPath = '/src/network/relay-client.ts',
        cryptoPath = '/src/network/crypto.ts';
      const [{ RelayClient }, { loadDeviceIdentity }] = await Promise.all([
        import(clientPath),
        import(cryptoPath),
      ]);
      try {
        await new RelayClient('http://127.0.0.1:4318', await loadDeviceIdentity()).request(
          '/api/network/messages',
          {
            conversationId: packet.conversationId,
            kind: 'chat',
            ciphertext: packet.ciphertext,
            iv: packet.iv,
          },
        );
        return { status: 200, message: 'accepted' };
      } catch (error) {
        return { status: (error as { status?: number }).status, message: (error as Error).message };
      }
    }, replayPacket);
    expect(blockedSend.status).toBe(409);
    expect(blockedSend.message).toContain('closed');
    await first.unroute('**/api/network/inbox');
    await other.getByRole('button', { name: 'Let our agents talk', exact: true }).click();
    await expect(first.getByRole('alert')).toContainText('This connection is blocked.');
    for (const page of [first, second])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    expect(errors).toEqual([]);
    // App deletion runs signed relay cleanup before discarding profile and device keys.
    await first.getByRole('button', { name: 'My agent', exact: true }).click();
    await first.getByRole('button', { name: 'Delete my data', exact: true }).click();
    await first
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete my data', exact: true })
      .click();
    await expect(first.getByRole('button', { name: 'Try the demo', exact: true })).toBeVisible();
    expect(await first.evaluate(() => localStorage.getItem('kin-network-identity-v1'))).toBeNull();
    expect(await first.evaluate(() => localStorage.getItem('kin-network-relays-v1'))).toBeNull();
    await expect(second.locator('.kn-current-thread')).toHaveCount(0);
  } finally {
    for (const page of [first, second]) {
      if (page.isClosed()) continue;
      const leave = page.getByRole('button', { name: 'Leave network', exact: true });
      if (await leave.count()) await leave.click().catch(() => {});
    }
    await firstContext.close();
    await secondContext.close();
  }
});

test('failed relay cleanup keeps the profile and device keys until signed leave can be retried', async ({
  page,
}, testInfo) => {
  await join(page, `Cleanup ${Date.now().toString(36)} ${testInfo.project.name}`);
  await page.route('**/api/network/leave', (route) => route.abort('connectionfailed'));
  await page.getByRole('button', { name: 'My agent', exact: true }).click();
  await page.getByRole('button', { name: 'Delete my data', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete my data', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your device keys were kept.');
  expect(await page.evaluate(() => localStorage.getItem('kin-network-identity-v1'))).not.toBeNull();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('kin-network-relays-v1') || '[]')),
  ).toContain('http://127.0.0.1:4318');
  await expect(dialog).toBeVisible();
  await page.unroute('**/api/network/leave');
  await dialog.getByRole('button', { name: 'Delete my data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kin-network-identity-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('kin-network-relays-v1'))).toBeNull();
});

test('primary Join the network creates a private profile and returns to capsule review before publishing', async ({
  page,
}) => {
  const registrations: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/network/register'))
      registrations.push(request.postData() || '');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Join the network', exact: true }).click();
  await page.getByRole('textbox', { name: /^Your name/ }).fill('Rowan');
  await page.getByRole('spinbutton', { name: 'Your age', exact: true }).fill('29');
  await page.getByRole('textbox', { name: /^Your city/ }).fill('New York');
  await expect(
    page.getByText('Your selected peer’s agent receives this during live negotiation', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Books', exact: false }).click();
  await page.getByRole('button', { name: 'Coffee', exact: false }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Kindness', exact: false }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByText('Review your public capsule before joining', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Let’s find my people', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A private path to a real hello.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose what your agent shares.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Join the real network', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: /I choose to publish this capsule/ }),
  ).not.toBeChecked();
  await expect(page.locator('.match-card')).toHaveCount(0);
  expect(registrations).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('kin-network-identity-v1'))).toBeNull();
  await cleanAxe(page);
});
