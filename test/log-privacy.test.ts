import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';

test('private session parse failures produce generic logs and preserve original evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-log-privacy-'));
  const app = createApp({ dataDirectory: directory });
  const logs: unknown[][] = [];
  const original = console.error;
  try {
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const initial = await fetch(base + '/api/session');
    const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    const token = cookie.split('=')[1];
    const corrupt = '{"updatedAt":PRIVATE-SESSION-CONTENT-SENTINEL}';
    const path = join(directory, createHash('sha256').update(token).digest('hex') + '.json');
    await writeFile(path, corrupt);
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    const response = await fetch(base + '/api/session', { headers: { Cookie: cookie } });
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /PRIVATE-SESSION|updatedAt|SyntaxError/);
    assert.deepEqual(logs, [['Kin request failed.']]);
    const { readFile } = await import('node:fs/promises');
    assert.equal(await readFile(path, 'utf8'), corrupt);
  } finally {
    console.error = original;
    app.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      app.close((error) => (error ? reject(error) : resolve())),
    );
    await app.drainMaintenance();
    await rm(directory, { recursive: true, force: true });
  }
});
