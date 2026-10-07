import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, emptyState } from '../server/store.js';
import { demoProfile } from '../src/matchmaking/index.js';

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

test('unaccessed expired local profiles are swept while active sessions and unrelated files remain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-session-retention-'));
  let clock = 1_000;
  const store = new SessionStore(directory, 100, () => clock);
  const stale = 'a'.repeat(64),
    active = 'b'.repeat(64);
  try {
    await store.write(stale, { ...emptyState(), profile: demoProfile() });
    clock += 50;
    await store.write(active, emptyState());
    await writeFile(join(directory, 'operator-notes.txt'), 'KEEP');
    await writeFile(join(directory, 'unrelated.json'), 'KEEP');
    clock += 50;
    assert.deepEqual(await store.sweep(), { examined: 2, removed: 1 });
    assert.equal((await store.read(stale)).profile, null);
    assert.equal((await readdir(directory)).length, 3);
    assert.equal(await readFile(join(directory, 'operator-notes.txt'), 'utf8'), 'KEEP');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('session sweep waits for an authorized write and rechecks the fresh timestamp before deleting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-session-sweep-race-'));
  let clock = 1_000;
  const store = new SessionStore(directory, 100, () => clock),
    token = 'a'.repeat(64);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    ready = new Promise<void>((resolve) => (started = resolve));
  try {
    await store.write(token, { ...emptyState(), profile: demoProfile() });
    clock += 50;
    const updating = store.update(token, async (state) => {
      started();
      await gate;
      return {
        state: { ...state, profile: { ...state.profile!, name: 'Fresh owner' } },
        result: null,
      };
    });
    await ready;
    clock += 100;
    const sweeping = store.sweep();
    release();
    await updating;
    assert.deepEqual(await sweeping, { examined: 1, removed: 0 });
    assert.equal((await store.read(token)).profile?.name, 'Fresh owner');
  } finally {
    release?.();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid local retention metadata is preserved for recovery rather than reset or erased', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-session-retention-invalid-'));
  const store = new SessionStore(directory),
    name = 'a'.repeat(64) + '.json';
  const source = JSON.stringify({ updatedAt: null, state: emptyState() });
  try {
    await writeFile(join(directory, name), source);
    await assert.rejects(() => store.sweep(), /retention metadata/);
    assert.equal(await readFile(join(directory, name), 'utf8'), source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
