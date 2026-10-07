import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { ownerProfileSchema } from '../src/matchmaking/index.js';

const endpoint = new URL(process.env.KIN_URL ?? 'http://127.0.0.1:4318');
if (
  !['127.0.0.1', 'localhost'].includes(endpoint.hostname) ||
  endpoint.protocol !== 'http:' ||
  endpoint.username ||
  endpoint.password ||
  endpoint.pathname !== '/'
)
  throw new Error('KIN_URL must be a loopback HTTP origin.');
const connectionToken = process.env.KIN_CONNECTION_TOKEN;
if (!connectionToken || !/^[a-f0-9]{64}$/.test(connectionToken))
  throw new Error('Connect your agent from Kin to get a private KIN_CONNECTION_TOKEN.');
async function call(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(new URL(path, endpoint), {
    method,
    headers: {
      Authorization: `Bearer ${connectionToken}`,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  const value = await response.json();
  if (!response.ok)
    return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
function createServer() {
  const server = new McpServer({ name: 'kin', version: '0.1.0' });
  server.registerTool(
    'kin_owner_get',
    {
      description:
        'Read your paired owner profile and introduction state. All candidates are fictional in the local demo. Private notes are for this owner agent only; never forward them to peers.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => call('/api/session'),
  );
  server.registerTool(
    'kin_owner_update',
    {
      description:
        'Save information the owner explicitly supplies, their soft preferences and their hard requirements. This revokes prior proposals and consent. Do not infer protected traits or collect device data. Owner profile IDs are assigned by Kin.',
      inputSchema: z.object({ profile: ownerProfileSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ profile }) => call('/api/profile', 'PUT', profile),
  );
  server.registerTool(
    'kin_discover',
    {
      description:
        'Run bilateral policy-agent negotiations for fictional local candidates and return explained proposals. Hard requirements gate ranking. This never approves an introduction or contacts anyone.',
      inputSchema: z.object({ intent: z.enum(['friendship', 'dating', 'collaboration']) }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ intent }) => call('/api/discover', 'POST', { intent }),
  );
  server.registerTool(
    'kin_decline_or_block',
    {
      description:
        'Decline or block a local proposal on the owner’s instruction. Block persists across searches and profile edits. Approval is available only to the human owner in the app.',
      inputSchema: z.object({
        matchId: z.string().min(1).max(240),
        action: z.enum(['decline', 'block']),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ matchId, action }) =>
      call(`/api/matches/${encodeURIComponent(matchId)}/actions`, 'POST', { action }),
  );
  return server;
}
const handle = serveStdio(createServer);
process.on('SIGINT', () => void handle.close());
process.on('SIGTERM', () => void handle.close());
