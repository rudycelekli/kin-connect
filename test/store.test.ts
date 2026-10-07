import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, emptyState } from '../server/store.js';

test('deletion revokes queued writes and leaves no profile file after completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-store-'));
  const store = new SessionStore(directory),
    token = 'a'.repeat(64);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  try {
    await store.write(token, emptyState());
    const writing = store.update(token, async (state) => {
      started();
      await gate;
      return { state: { ...state, searchedAt: 'private-value' }, result: null };
    });
    const rejected = assert.rejects(writing, /deleted/);
    await ready;
    const deleting = store.delete(token);
    release();
    await rejected;
    await deleting;
    assert.deepEqual(await readdir(directory), []);
    assert.equal((await store.read(token)).profile, null);
    assert.equal(store.isRevoked(token), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
