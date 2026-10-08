import { loadIntakeSettings } from './intake-settings.js';
import { createApp } from './app.js';
import { resolve } from 'node:path';
import { acquireDataDirectoryLock } from './process-lock.js';
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535.');
const publicOrigin =
  process.env.KIN_PUBLIC_ORIGIN ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
if (
  publicOrigin &&
  (new URL(publicOrigin).protocol !== 'https:' || new URL(publicOrigin).origin !== publicOrigin)
)
  throw new Error('KIN_PUBLIC_ORIGIN must be an exact HTTPS origin.');
const dataRoot = resolve(process.env.KIN_DATA_DIR ?? '.data');
const allowedOrigins = [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(process.env.KIN_DEV_ORIGIN ? [process.env.KIN_DEV_ORIGIN] : []),
];
const relayOrigins = (process.env.KIN_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const releaseDataLock = await acquireDataDirectoryLock(dataRoot);
let app: ReturnType<typeof createApp>;
try {
  app = createApp({
    dataDirectory: resolve(dataRoot, 'sessions'),
    networkDirectory: resolve(dataRoot, 'network'),
    allowedOrigins,
    relayOrigins,
    publicOrigin,
    publicAliases: (process.env.KIN_PUBLIC_ALIASES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    assetOrigin: publicOrigin ?? `http://127.0.0.1:${port}`,
    openAIAppsChallenge: process.env.KIN_OPENAI_APPS_CHALLENGE,
    intakeSettings: loadIntakeSettings(process.env, Boolean(publicOrigin)),
  });
} catch (error) {
  await releaseDataLock();
  throw error;
}
app.listen(port, publicOrigin ? '0.0.0.0' : '127.0.0.1', () =>
  console.log(
    `Kin is ready at ${publicOrigin ?? `http://127.0.0.1:${port}`} (${publicOrigin ? 'public relay' : 'your local workspace'})`,
  ),
);
let shuttingDown = false;
const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.close(async () => {
    try {
      try {
        await app.drainMaintenance();
      } finally {
        await releaseDataLock();
      }
      process.exit(exitCode);
    } catch (error) {
      console.error('Kin could not finish maintenance or release its data lock.');
      process.exit(1);
    }
  });
};
app.once('error', (error) => {
  console.error(error.message);
  shutdown(1);
});
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
