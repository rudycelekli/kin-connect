import type { Server } from 'node:http';

type DrainableServer = Server & {
  stopAcceptingRequests(): void;
  drainMaintenance(): Promise<void>;
};

/** Bound socket grace, while keeping the data lock until all handlers/checkpoints finish. */
export async function shutdownServer(server: DrainableServer, socketGraceMs = 5_000) {
  if (!Number.isSafeInteger(socketGraceMs) || socketGraceMs < 1)
    throw new Error('Invalid shutdown socket grace.');
  server.stopAcceptingRequests();
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING')
        reject(error);
      else resolve();
    });
  });
  const forceSockets = setTimeout(() => server.closeAllConnections(), socketGraceMs);
  try {
    await closed;
    await server.drainMaintenance();
  } finally {
    clearTimeout(forceSockets);
  }
}
