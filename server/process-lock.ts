import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { resolve } from 'node:path';

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const sameFile = (left: BigIntStats, right: BigIntStats) =>
  right.isFile() && left.dev === right.dev && left.ino === right.ino;

/**
 * Exclusively owns this data directory until release. Existing locks, including
 * stale locks, are never recovered automatically. Operators must not remove or
 * replace a live marker: portable filesystem APIs do not offer conditional unlink.
 */
export async function acquireDataDirectoryLock(directory: string): Promise<() => Promise<void>> {
  const root = resolve(directory);
  const path = resolve(root, '.kin-process.lock');
  await mkdir(root, { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST')
      throw new Error(
        `Kin data directory is already in use or has a stale lock. Stop its server; remove ${path} only after confirming no process uses it.`,
      );
    throw error;
  }

  const token = randomUUID();
  const initialMarker = JSON.stringify({ token, pid: process.pid }) + '\n';
  let identity: BigIntStats | undefined;
  try {
    identity = await handle.stat({ bigint: true });
    await handle.writeFile(initialMarker, 'utf8');
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    // Creation succeeded, so a failed initial write may leave an empty or partial
    // marker. Remove only the file we created, never a subsequent replacement.
    if (identity) {
      try {
        const current = await lstat(path, { bigint: true });
        if (
          sameFile(identity, current) &&
          initialMarker.startsWith(await readFile(path, 'utf8')) &&
          sameFile(identity, await lstat(path, { bigint: true }))
        )
          await unlink(path);
      } catch {
        // If cleanup is impossible, leave the marker and fail startup closed.
      }
    }
    throw error;
  }

  const ownedIdentity = identity;
  let releasePromise: Promise<void> | undefined;
  return () =>
    (releasePromise ??= (async () => {
      try {
        if (!sameFile(ownedIdentity, await lstat(path, { bigint: true }))) return;
        const contents = await readFile(path, 'utf8');
        let marker: unknown;
        try {
          marker = JSON.parse(contents);
        } catch {
          return; // An altered or incomplete marker belongs to manual recovery.
        }
        if (
          !marker ||
          typeof marker !== 'object' ||
          !('token' in marker) ||
          marker.token !== token ||
          !('pid' in marker) ||
          marker.pid !== process.pid
        )
          return;
        if (!sameFile(ownedIdentity, await lstat(path, { bigint: true }))) return;
        await unlink(path);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    })());
}
