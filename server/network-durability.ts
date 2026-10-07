import { open } from 'node:fs/promises';

/** POSIX directory fsync commits rename/unlink metadata before an acknowledgment.
 * Node cannot portably open and flush directories on Windows; file flush still applies.
 * Hardware/filesystem failures can still prevent a durable acknowledgment.
 */
export async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  let directory;
  try {
    directory = await open(path, 'r');
  } catch (error) {
    // Deleting an absent session in a directory never created has no metadata to commit.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
