import { z } from 'zod';
import { proposeIntake, IntakeAssistantError } from './intake-assistant.js';
import { IntakeRequestBudget, type IntakeSettings } from './intake-settings.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discover,
  demoProfile,
  refreshSuggestion,
  transitionMatch,
  validateProfile,
  containsRecognizableContact,
} from '../src/matchmaking/index.js';
import type { Intent, SessionState } from '../src/shared/types.js';
import { SessionStore } from './store.js';
import { createNetworkRouter } from './network.js';
import { createChatGPTRouter } from './chatgpt.js';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const INTENTS = new Set(['friendship', 'dating', 'collaboration']);
const ACTIONS = new Set(['approve', 'peer-approve', 'decline', 'block']);
const MAX_ACTIVE_REQUESTS = 128;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Use application/json.');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Send a valid JSON object.');
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
export function createApp(
  options: {
    dataDirectory?: string;
    staticDirectory?: string;
    allowedOrigins?: string[];
    networkDirectory?: string;
    publicOrigin?: string;
    publicAliases?: string[];
    assetOrigin?: string;
    relayOrigins?: string[];
    openAIAppsChallenge?: string;
    intakeSettings?: IntakeSettings;
    intakeFetch?: typeof fetch;
    intakeNow?: () => number;
  } = {},
) {
  const intakeBudget = new IntakeRequestBudget(options.intakeNow);
  const openAIAppsChallenge = options.openAIAppsChallenge;
  if (
    openAIAppsChallenge !== undefined &&
    (typeof openAIAppsChallenge !== 'string' ||
      openAIAppsChallenge.length > 512 ||
      /[^\x21-\x7e]/.test(openAIAppsChallenge))
  )
    throw new Error(
      'KIN_OPENAI_APPS_CHALLENGE must be at most 512 visible ASCII characters without whitespace or control characters.',
    );
  const store = new SessionStore(options.dataDirectory ?? resolve('.data/sessions'));
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const staticRoot = resolve(options.staticDirectory ?? resolve(projectRoot, 'dist'));
  const exactPublicOrigin = (value: string, localFixture = false) => {
    const parsed = new URL(value);
    const loopbackFixture =
      localFixture &&
      parsed.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !loopbackFixture) || parsed.origin !== value)
      throw new Error('Public origins must be exact HTTPS origins.');
    return value;
  };
  // Public-mode integration fixtures use loopback HTTP; the real entrypoint requires HTTPS.
  const publicOrigin = options.publicOrigin
    ? exactPublicOrigin(options.publicOrigin, true)
    : undefined;
  if (options.publicAliases?.length && !publicOrigin)
    throw new Error('Public aliases require a public origin.');
  const publicAliases = (options.publicAliases ?? []).map((value) => exactPublicOrigin(value));
  const publicHosts = new Set(
    [...(publicOrigin ? [publicOrigin] : []), ...publicAliases].map((value) => new URL(value).host),
  );
  const allowedOrigins = [
    ...(options.allowedOrigins ?? []),
    ...(options.relayOrigins ?? []),
    ...(publicOrigin ? [publicOrigin] : []),
    ...publicAliases,
  ];
  const networkRouter = createNetworkRouter({
    directory: options.networkDirectory ?? resolve(options.dataDirectory ?? '.data', 'network'),
    allowedOrigins,
  });
  const chatGPTRouter = createChatGPTRouter({
    staticDirectory: staticRoot,
    publicOrigin: publicOrigin ?? options.assetOrigin ?? 'http://127.0.0.1:4318',
    allowedOrigins,
  });
  const pairedAgents = new Map<string, { sessionToken: string; expiresAt: number }>();
  let sessionSweep: Promise<unknown> | undefined;
  const sweepSessions = () =>
    (sessionSweep ??= store.sweep().finally(() => {
      sessionSweep = undefined;
    }));
  const sessionMaintenance = setInterval(() => {
    void sweepSessions().catch(() => {});
  }, 60_000);
  sessionMaintenance.unref();
  let acceptingRequests = true;
  const activeRequests = new Set<Promise<void>>();
  const server = createServer(
    {
      requestTimeout: 30_000,
      headersTimeout: 15_000,
      connectionsCheckingInterval: 1_000,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16_384,
    },
    async (req, res) => {
      if (!acceptingRequests) {
        res.setHeader('Connection', 'close');
        json(res, 503, { error: 'Kin is shutting down. Please try again later.' });
        return;
      }
      if (activeRequests.size >= MAX_ACTIVE_REQUESTS) {
        res.setHeader('Connection', 'close');
        res.setHeader('Retry-After', '1');
        json(res, 503, { error: 'Kin is busy. Please try again shortly.' });
        return;
      }
      let finishRequest!: () => void;
      const completed = new Promise<void>((resolve) => (finishRequest = resolve));
      activeRequests.add(completed);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https: http://127.0.0.1:4318 http://localhost:4318; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      try {
        // Reject DNS-rebinding hosts. Railway's probe can read only relay readiness in public mode.
        const host = req.headers.host ?? '';
        const railwayHealthcheck =
          Boolean(publicOrigin) &&
          host === 'healthcheck.railway.app' &&
          req.method === 'GET' &&
          req.url === '/api/network/health';
        if (
          !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) &&
          !publicHosts.has(host) &&
          !railwayHealthcheck
        )
          throw new HttpError(403, 'Kin runs on localhost.');
        const url = new URL(req.url ?? '/', `http://${host}`);
        if (url.pathname === '/.well-known/openai-apps-challenge') {
          if (!['GET', 'HEAD'].includes(req.method ?? 'GET'))
            throw new HttpError(405, 'Method not allowed.');
          if (!openAIAppsChallenge)
            throw new HttpError(404, 'Verification challenge not configured.');
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(openAIAppsChallenge),
            'Cache-Control': 'no-store',
          });
          res.end(req.method === 'HEAD' ? undefined : openAIAppsChallenge);
          return;
        }
        if (await networkRouter(req, res, url)) return;
        if (await chatGPTRouter(req, res, url)) return;
        if (publicOrigin && url.pathname.startsWith('/api/') && url.pathname !== '/api/health')
          throw new HttpError(
            403,
            'Owner profile APIs are available only in the local installation.',
          );
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET');
        if (
          mutation &&
          req.headers.origin &&
          req.headers.origin !== `http://${host}` &&
          !(options.allowedOrigins ?? []).includes(req.headers.origin)
        )
          throw new HttpError(403, 'Cross-origin changes are not allowed.');
        if (mutation && req.headers['sec-fetch-site'] === 'cross-site')
          throw new HttpError(403, 'Cross-site changes are not allowed.');
        if (req.method === 'GET' && url.pathname === '/api/health') {
          await sweepSessions();
          return json(res, 200, {
            ok: true,
            mode: publicOrigin ? 'public-relay' : 'local-demo',
            protocol: 'kin/0.1',
          });
        }
        if (req.method === 'GET' && url.pathname === '/.well-known/kin-agent.json')
          return json(res, 200, {
            name: 'Kin local policy agents',
            version: '0.1',
            protocol: 'kin/0.1',
            skills: ['bilateral-policy-match', 'consent-gated-introduction'],
            mode: 'fictional-local-demo',
            a2aConformant: false,
          });
        if (url.pathname.startsWith('/api/')) {
          const cookie = req.headers.cookie
            ?.split(';')
            .map((s) => s.trim())
            .find((s) => s.startsWith('kin_session='))
            ?.slice('kin_session='.length);
          const bearer = req.headers.authorization;
          const isAgent = Boolean(bearer);
          let agentPair;
          if (bearer) {
            if (!/^Bearer [a-f0-9]{64}$/.test(bearer))
              throw new HttpError(401, 'Invalid agent connection.');
            const connectionToken = bearer.slice(7);
            agentPair = pairedAgents.get(connectionToken);
            if (!agentPair || Date.now() >= agentPair.expiresAt) {
              pairedAgents.delete(connectionToken);
              throw new HttpError(401, 'Reconnect your agent from the app.');
            }
          }
          const token =
            agentPair?.sessionToken ??
            (cookie && /^[a-f0-9]{64}$/.test(cookie) && !store.isRevoked(cookie)
              ? cookie
              : randomBytes(32).toString('hex'));
          if (!isAgent && token !== cookie)
            res.setHeader(
              'Set-Cookie',
              `kin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
            );
          if (
            isAgent &&
            !['/api/session', '/api/profile', '/api/discover'].includes(url.pathname) &&
            !/^\/api\/matches\/[^/]+\/actions$/.test(url.pathname)
          )
            throw new HttpError(403, 'This agent connection cannot perform that action.');
          if (req.method === 'POST' && url.pathname === '/api/agent-connection') {
            const current = await store.read(token);
            if (store.isRevoked(token) || !current.profile)
              throw new HttpError(409, 'Meet your agent first.');
            const connectionToken = randomBytes(32).toString('hex');
            // Only the newest pairing for this owner remains valid.
            for (const [key, pair] of pairedAgents)
              if (pair.sessionToken === token || pair.expiresAt <= Date.now())
                pairedAgents.delete(key);
            pairedAgents.set(connectionToken, {
              sessionToken: token,
              expiresAt: Date.now() + 86_400_000,
            });
            const port = req.socket.localPort;
            return json(res, 200, {
              expiresInHours: 24,
              config: {
                mcpServers: {
                  kin: {
                    command: process.execPath,
                    args: [
                      fileURLToPath(import.meta.resolve('tsx/cli')),
                      resolve(projectRoot, 'server/mcp.ts'),
                    ],
                    env: {
                      KIN_URL: `http://127.0.0.1:${port ?? 4318}`,
                      KIN_CONNECTION_TOKEN: connectionToken,
                    },
                  },
                },
              },
            });
          }
          if (req.method === 'GET' && url.pathname === '/api/session')
            return json(res, 200, await store.read(token));
          if (req.method === 'GET' && url.pathname === '/api/export') {
            res.setHeader('Content-Disposition', 'attachment; filename="kin-data.json"');
            return json(res, 200, await store.read(token));
          }
          if (req.method === 'DELETE' && url.pathname === '/api/session') {
            // Serialize deletion with changes and revoke the browser capability.
            await store.delete(token);
            for (const [key, pair] of pairedAgents)
              if (pair.sessionToken === token) pairedAgents.delete(key);
            res.setHeader(
              'Set-Cookie',
              'kin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
            );
            return json(res, 200, { ok: true });
          }
          if (req.method === 'GET' && url.pathname === '/api/intake/providers')
            return json(res, 200, {
              providers: Object.keys(options.intakeSettings ?? {}),
              processing: 'local-server-to-selected-external-provider',
              reviewRequired: true,
              attemptLimitPerRunningServerHour: 10,
            });
          if (req.method === 'POST' && url.pathname === '/api/intake/suggestions') {
            const input = z
              .object({
                provider: z.enum(['openai', 'anthropic']),
                text: z
                  .string()
                  .trim()
                  .min(1)
                  .max(2000)
                  .refine((value) => !containsRecognizableContact(value)),
                approved: z.literal(true),
              })
              .strict()
              .safeParse(await body(req));
            if (!input.success)
              throw new HttpError(
                400,
                'Select contact-free text and explicitly approve external processing.',
              );
            const current = await store.read(token);
            if (store.isRevoked(token) || !current.profile || current.profile.paused)
              throw new HttpError(409, 'A reviewed, active owner profile is required.');
            const config = options.intakeSettings?.[input.data.provider];
            if (!config)
              throw new HttpError(503, 'This intake provider is not enabled on your local server.');
            const release = intakeBudget.acquire();
            if (!release)
              throw new HttpError(429, 'Intake is busy or its request allowance is exhausted.');
            try {
              const suggestions = await proposeIntake(input.data, config, {
                fetch: options.intakeFetch,
              });
              // Suggestions never mutate the owner profile, consent or discovery state.
              if (store.isRevoked(token))
                throw new HttpError(409, 'The owner session was deleted.');
              const latest = await store.read(token);
              if (
                store.isRevoked(token) ||
                !latest.profile ||
                latest.profile.paused ||
                JSON.stringify(latest.profile) !== JSON.stringify(current.profile)
              )
                throw new HttpError(409, 'The reviewed owner profile changed during intake.');
              return json(res, 200, suggestions);
            } catch (error) {
              if (error instanceof HttpError) throw error;
              if (error instanceof IntakeAssistantError)
                throw new HttpError(
                  error.code === 'invalid-input'
                    ? 400
                    : error.code === 'invalid-config'
                      ? 503
                      : 502,
                  error.message,
                );
              throw new HttpError(
                502,
                'The intake provider could not return reviewed suggestions.',
              );
            } finally {
              release();
            }
          }
          if (req.method === 'POST' && url.pathname === '/api/demo') {
            const state: SessionState = {
              profile: { ...demoProfile(), id: randomUUID() },
              matches: [],
              demo: true,
              searchedAt: new Date().toISOString(),
            };
            state.matches = discover(state.profile!, 'friendship').matches;
            const result = await store.update(token, () => ({ state, result: state }));
            return json(res, 200, result);
          }
          if (req.method === 'PUT' && url.pathname === '/api/profile') {
            const input = await body(req);
            let validated;
            try {
              validated = validateProfile({ ...input, id: randomUUID() });
            } catch (error) {
              const issue = (error as { issues?: Array<{ message: string }> }).issues?.[0]?.message;
              throw new HttpError(
                400,
                issue ??
                  'Check your profile: adults 18+, valid preferences, and complete required fields.',
              );
            }
            const state = await store.update(token, (old) => {
              const profile = { ...validated, id: old.profile?.id ?? validated.id };
              // A changed policy invalidates every prior proposal and consent.
              return {
                state: { ...old, profile, matches: [], searchedAt: null },
                result: { ...old, profile, matches: [], searchedAt: null },
              };
            });
            return json(res, 200, state);
          }
          if (req.method === 'POST' && url.pathname === '/api/discover') {
            const { intent } = await body(req);
            if (typeof intent !== 'string' || !INTENTS.has(intent))
              throw new HttpError(400, 'Choose friendship, dating, or collaboration.');
            const result = await store.update(token, (state) => {
              if (!state.profile) throw new HttpError(409, 'Meet your agent first.');
              if (state.profile.paused)
                throw new HttpError(409, 'Your agent is paused. Resume it to find connections.');
              if (!state.profile.intents.includes(intent as Intent))
                throw new HttpError(409, 'Add this connection type to your preferences first.');
              const found = discover(state.profile, intent as Intent);
              const existing = new Map(state.matches.map((m) => [m.id, m]));
              // Preserve consent, declined and blocked states across repeated searches.
              const blocked = new Set(state.blockedPersonIds ?? []);
              const current = found.matches
                .map((m) => refreshSuggestion(existing.get(m.id), m))
                .filter(
                  (m) =>
                    !blocked.has(m.person.id) && m.state !== 'blocked' && m.state !== 'declined',
                );
              const other = state.matches.filter(
                (m) => m.intent !== intent || m.state === 'blocked' || m.state === 'declined',
              );
              return {
                state: {
                  ...state,
                  matches: [...current, ...other],
                  searchedAt: new Date().toISOString(),
                },
                result: { ...found, matches: current },
              };
            });
            return json(res, 200, result);
          }
          const actionPath = url.pathname.match(/^\/api\/matches\/([^/]+)\/actions$/);
          if (req.method === 'POST' && actionPath) {
            const { action } = await body(req);
            if (typeof action !== 'string' || !ACTIONS.has(action))
              throw new HttpError(400, 'Unknown introduction action.');
            if (isAgent && (action === 'approve' || action === 'peer-approve'))
              throw new HttpError(403, 'Owner approval must happen in the app.');
            const result = await store.update(token, (state) => {
              if (
                !state.profile ||
                (state.profile.paused && (action === 'approve' || action === 'peer-approve'))
              )
                throw new HttpError(409, 'Resume your agent before approving introductions.');
              const index = state.matches.findIndex((m) => m.id === actionPath[1]);
              if (index < 0) throw new HttpError(404, 'Introduction not found.');
              if (
                (state.blockedPersonIds ?? []).includes(state.matches[index].person.id) &&
                (action === 'approve' || action === 'peer-approve')
              )
                throw new HttpError(409, 'This person is blocked.');
              let updated;
              try {
                updated = transitionMatch(
                  state.matches[index],
                  action as 'approve' | 'peer-approve' | 'decline' | 'block',
                );
              } catch (error) {
                throw new HttpError(409, (error as Error).message);
              }
              const matches = state.matches.map((m, i) =>
                i === index
                  ? updated
                  : action === 'block' && m.person.id === updated.person.id
                    ? { ...m, state: 'blocked' as const, ownerApproved: false, peerApproved: false }
                    : m,
              );
              const blockedPersonIds =
                action === 'block'
                  ? [...new Set([...(state.blockedPersonIds ?? []), updated.person.id])]
                  : state.blockedPersonIds;
              return { state: { ...state, matches, blockedPersonIds }, result: updated };
            });
            return json(res, 200, result);
          }
          throw new HttpError(404, 'API route not found.');
        }
        if (!['GET', 'HEAD'].includes(req.method ?? 'GET'))
          throw new HttpError(405, 'Method not allowed.');
        let pathname: string;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          throw new HttpError(400, 'Invalid URL.');
        }
        let path = resolve(staticRoot, '.' + pathname);
        if (path !== staticRoot && !path.startsWith(staticRoot + sep))
          throw new HttpError(403, 'Invalid file path.');
        try {
          if (!(await stat(path)).isFile()) path = resolve(staticRoot, 'index.html');
        } catch {
          if (extname(pathname)) throw new HttpError(404, 'File not found.');
          path = resolve(staticRoot, 'index.html');
        }
        let content: Buffer;
        try {
          content = await readFile(path);
        } catch {
          throw new HttpError(503, 'Build the frontend with npm run build, or use npm run dev.');
        }
        // Build-owned public assets contain no owner data. MCP hosts may load them from a sandbox origin.
        if (['.js', '.css', '.woff2', '.svg', '.png'].includes(extname(path)))
          res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200, {
          'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
          'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
        });
        res.end(req.method === 'HEAD' ? undefined : content);
      } catch (error) {
        const known = error instanceof HttpError;
        if (!known) console.error('Kin request failed.');
        if (!res.headersSent)
          json(res, known ? error.status : 500, {
            error: known ? error.message : 'Something went wrong. Please try again.',
          });
        else res.end();
      } finally {
        activeRequests.delete(completed);
        finishRequest();
      }
    },
  );
  server.maxHeadersCount = 100;
  server.once('close', () => {
    clearInterval(sessionMaintenance);
    networkRouter.stop();
  });
  return Object.assign(server, {
    async initialize() {
      // Validate persisted data before the entrypoint announces readiness.
      await sweepSessions();
      await networkRouter.sweep();
    },
    stopAcceptingRequests() {
      acceptingRequests = false;
    },
    async drainMaintenance() {
      acceptingRequests = false;
      clearInterval(sessionMaintenance);
      // A closed socket does not imply its asynchronous handler has completed.
      await Promise.all(activeRequests);
      await sessionSweep?.catch(() => {});
      await networkRouter.close();
    },
  });
}
