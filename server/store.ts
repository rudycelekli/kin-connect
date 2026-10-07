import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionState } from '../src/shared/types.js';
import { syncDirectory } from './network-durability.js';

export const emptyState = (): SessionState => ({
  profile: null,
  matches: [],
  demo: true,
  searchedAt: null,
});
interface StoredSession {
  updatedAt: number;
  state: SessionState;
}
/** Local-only storage. Session capabilities are hashed before becoming filenames. */
export class SessionStore {
  private locks = new Map<string, Promise<unknown>>();
  private revoked = new Set<string>();
  isRevoked(token: string) {
    return this.revoked.has(token);
  }
  constructor(
    private directory: string,
    private ttlMs = 24 * 60 * 60 * 1000,
  ) {}
  private path(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid session capability');
    return join(this.directory, createHash('sha256').update(token).digest('hex') + '.json');
  }
  async read(token: string): Promise<SessionState> {
    const path = this.path(token);
    if (this.revoked.has(token)) return emptyState();
    try {
      const data: StoredSession = JSON.parse(await readFile(path, 'utf8'));
      if (!data || typeof data.updatedAt !== 'number' || Date.now() - data.updatedAt > this.ttlMs) {
        await rm(path, { force: true });
        await syncDirectory(this.directory);
        return emptyState();
      }
      return data.state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw error;
    }
  }
  async write(token: string, state: SessionState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(token),
      temp = path + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify({ updatedAt: Date.now(), state }), {
        mode: 0o600,
        flush: true,
      });
      if (this.revoked.has(token)) throw new Error('Session was deleted.');
      await rename(temp, path);
      await syncDirectory(this.directory);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async update<T>(
    token: string,
    mutate: (
      state: SessionState,
    ) => { state: SessionState; result: T } | Promise<{ state: SessionState; result: T }>,
  ): Promise<T> {
    const previous = this.locks.get(token) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        if (this.revoked.has(token)) throw new Error('Session was deleted.');
        const next = await mutate(await this.read(token));
        if (this.revoked.has(token)) throw new Error('Session was deleted.');
        await this.write(token, next.state);
        return next.result;
      });
    this.locks.set(token, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(token) === current) this.locks.delete(token);
    }
  }
  async delete(token: string) {
    const path = this.path(token);
    this.revoked.add(token);
    const previous = this.locks.get(token) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        await rm(path, { force: true });
        await syncDirectory(this.directory);
      });
    this.locks.set(token, current);
    try {
      await current;
    } finally {
      if (this.locks.get(token) === current) this.locks.delete(token);
    }
  }
}
