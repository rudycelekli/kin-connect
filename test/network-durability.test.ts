import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, emptyState } from '../server/store.js';
import { demoProfile } from '../src/matchmaking/index.js';

test('local session publication failure preserves prior state and later writes/deletion recover durably', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-session-durable-'));
  try {
    const token = 'a'.repeat(64),
      store = new SessionStore(directory);
    const initial = { ...emptyState(), profile: demoProfile() };
    await store.write(token, initial);
    const path = join(directory, `${createHash('sha256').update(token).digest('hex')}.json`);
    const backup = join(directory, 'previous.json');
    const previous = await readFile(path, 'utf8');
    await rename(path, backup);
    await mkdir(path);
    await assert.rejects(() =>
      store.write(token, {
        ...initial,
        profile: { ...initial.profile!, name: 'Uncommitted change' },
      }),
    );
    assert.equal(await readFile(backup, 'utf8'), previous);
    assert.equal(
      (await readdir(directory)).some((name) => name.endsWith('.tmp')),
      false,
    );
    await rm(path, { recursive: true });
    await rename(backup, path);
    assert.equal((await store.read(token)).profile?.name, initial.profile.name);
    await store.update(token, (state) => ({
      state: { ...state, profile: { ...state.profile!, name: 'Recovered owner' } },
      result: null,
    }));
    const restarted = new SessionStore(directory);
    assert.equal((await restarted.read(token)).profile?.name, 'Recovered owner');
    await restarted.delete(token);
    await assert.rejects(() => readFile(path));
    assert.equal((await new SessionStore(directory).read(token)).profile, null);
    await assert.rejects(() => restarted.write(token, initial), /deleted/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
