import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, lstat } from 'node:fs/promises';
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
    private now: () => number = Date.now,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid local session retention.');
  }
  private path(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid session capability');
    return join(this.directory, createHash('sha256').update(token).digest('hex') + '.json');
  }
  private async serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    this.locks.set(key, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
  private timestamp(data: StoredSession): number {
    if (!data || !Number.isFinite(data.updatedAt) || data.updatedAt < 0 || !data.state)
      throw new Error('Local session retention metadata is invalid.');
    return data.updatedAt;
  }
  async read(token: string): Promise<SessionState> {
    return this.serialized(this.path(token), () => this.readUnlocked(token));
  }
  private async readUnlocked(token: string): Promise<SessionState> {
    const path = this.path(token);
    if (this.revoked.has(token)) return emptyState();
    try {
      const data: StoredSession = JSON.parse(await readFile(path, 'utf8'));
      if (this.now() - this.timestamp(data) >= this.ttlMs) {
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
    return this.serialized(this.path(token), () => this.publish(token, state));
  }
  private async publish(token: string, state: SessionState) {
    if (this.revoked.has(token)) throw new Error('Session was deleted.');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(token),
      temp = path + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify({ updatedAt: this.now(), state }), {
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
    return this.serialized(this.path(token), async () => {
      if (this.revoked.has(token)) throw new Error('Session was deleted.');
      const next = await mutate(await this.readUnlocked(token));
      if (this.revoked.has(token)) throw new Error('Session was deleted.');
      await this.publish(token, next.state);
      return next.result;
    });
  }
  async delete(token: string) {
    const path = this.path(token);
    this.revoked.add(token);
    return this.serialized(path, async () => {
      await rm(path, { force: true });
      await syncDirectory(this.directory);
    });
  }
  /** Cleans expired regular session files without requiring the owner's capability. */
  async sweep(): Promise<{ examined: number; removed: number }> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { examined: 0, removed: 0 };
      throw error;
    }
    let examined = 0,
      removed = 0;
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const path = join(this.directory, name);
      await this.serialized(path, async () => {
        try {
          if (!(await lstat(path)).isFile()) return;
          const data: StoredSession = JSON.parse(await readFile(path, 'utf8'));
          const timestamp = this.timestamp(data);
          examined += 1;
          if (this.now() - timestamp < this.ttlMs) return;
          await rm(path, { force: true });
          await syncDirectory(this.directory);
          removed += 1;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      });
    }
    return { examined, removed };
  }
}
