import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

const RESOURCE = 'ui://kin/connections.html';
/** Public tools open a private browser UI. They cannot read profiles, approve, or message people. */
export function createChatGPTServer(options: { staticDirectory: string; publicOrigin: string }) {
  const server = new McpServer({ name: 'kin-connections', version: '0.1.0' });
  const origin = new URL(options.publicOrigin).origin;
  registerAppResource(
    server,
    'kin-connections',
    RESOURCE,
    { description: 'Private owner workspace for consent-based agent introductions.' },
    async () => {
      let html = await readFile(resolve(options.staticDirectory, 'index.html'), 'utf8');
      // Vite emits only trusted, build-owned asset paths; no owner input enters this document.
      html = html.replace(/(src|href)="(?:\.\/|\/)(assets\/[^"<>]+)"/g, `$1="${origin}/$2"`);
      html = html.replace(
        '<head>',
        `<head><script>window.__KIN_WIDGET__=true;window.__KIN_RELAY__=${JSON.stringify(origin)};history.replaceState(null,"","?kin=network");</script>`,
      );
      return {
        contents: [
          {
            uri: RESOURCE,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                domain: origin,
                prefersBorder: false,
                csp: { connectDomains: [origin], resourceDomains: [origin] },
              },
              'openai/widgetDescription':
                'Kin lets owners create a device-local profile, opt into a pseudonymous network, review encrypted agent negotiations, and approve introductions themselves.',
              'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
            },
          },
        ],
      };
    },
  );
  registerAppTool(
    server,
    'kin_open_connections',
    {
      title: 'Open Kin connections',
      description:
        'Open Kin for friendship, dating, collaboration, or a purposeful introduction. Owners enter sensitive preferences privately in the widget. This tool does not search people, publish a profile, contact anyone, approve, or expose personal data.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE, visibility: ['model', 'app'] } },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: 'Kin is open. Complete your private profile in the workspace. Joining the network and each introduction require your explicit choice; human chat unlocks after both owners approve.',
        },
      ],
      structuredContent: { workspace: 'kin', consent: 'both-owners-required' },
    }),
  );
  server.registerTool(
    'kin_explain_privacy',
    {
      description:
        'Explain Kin privacy, consent, and current limitations. This cannot read an owner profile or network messages.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: 'Profiles and private keys stay in browser storage on your device. You explicitly choose a public alias, purpose, interests, and connection types before joining. Agents disclose a limited set of matching facts to the selected peer through encrypted messages; your raw hard requirements and private notes stay local. The relay sees public capsules, participant identifiers, timing, and ciphertext. Chat needs signed approval from both owners. The prototype is unaudited, does not verify real-world identity, and has no forward secrecy; protect your device. Leaving removes relay records but cannot erase copies a peer already received. Kin makes no absolute privacy guarantee.',
        },
      ],
    }),
  );
  return server;
}

export function createChatGPTRouter(options: {
  staticDirectory: string;
  publicOrigin: string;
  allowedOrigins: string[];
}) {
  const origins = new Set([options.publicOrigin, ...options.allowedOrigins]);
  const requests = new Map<string, { since: number; count: number }>();
  return async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    if (url.pathname !== '/mcp') return false;
    const now = Date.now();
    for (const [key, value] of requests) if (now - value.since >= 60_000) requests.delete(key);
    const ip = req.socket.remoteAddress ?? 'unknown';
    const rate = requests.get(ip) ?? { since: now, count: 0 };
    if (rate.count >= 120 || (!requests.has(ip) && requests.size >= 5000)) {
      res.writeHead(429, { 'Retry-After': '60' }).end('Try again in a minute.');
      return true;
    }
    rate.count++;
    requests.set(ip, rate);
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      res.writeHead(403).end('Origin is not allowed.');
      return true;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res
        .writeHead(204, {
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, MCP-Session-Id',
          'Access-Control-Expose-Headers': 'MCP-Session-Id',
        })
        .end();
      return true;
    }
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) {
      res.writeHead(405).end();
      return true;
    }
    let parsedBody: unknown;
    if (req.method === 'POST') {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) {
          res.writeHead(413).end('Request is too large.');
          return true;
        }
        chunks.push(chunk);
      }
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400).end('Invalid JSON.');
        return true;
      }
    }
    const server = createChatGPTServer(options);
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.once('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
    return true;
  };
}
