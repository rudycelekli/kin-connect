import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const RESOURCE = 'ui://kin/connections.html';
const LIMIT = 2 * 1024 * 1024;
const TIMEOUT = 10_000;
const USAGE =
  'tsx scripts/check-deployment.ts --url <exact HTTPS origin> [--origin <exact HTTPS client origin>] [--output <JSON file>] [--allow-local]';
type Options = { url: string; origin?: string; output?: string; allowLocal?: boolean };
type Check = { id: string; passed: boolean; expectation: string; failure?: string };
class CheckFailure extends Error {}
function must(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CheckFailure(code);
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const onlyOrigin = (value: unknown, origin: string) =>
  Array.isArray(value) && value.length === 1 && value[0] === origin;

function exactOrigin(value: string, allowLocal = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CheckFailure('invalid-origin');
  }
  const hostname = url.hostname.replace(/\.$/, '');
  const loopback =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127\./.test(hostname) ||
    hostname === '[::1]' ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/i.test(hostname);
  must(value === url.origin && !url.username && !url.password, 'invalid-origin');
  must(
    url.protocol === 'https:' || (allowLocal && loopback && url.protocol === 'http:'),
    'https-required',
  );
  must(!hostname.endsWith('.invalid') && (allowLocal || !loopback), 'public-origin-required');
  return url.origin;
}

async function limitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      must(size <= LIMIT, 'response-too-large');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Read-only public contract probe. It never supplies owner credentials or joins a relay. */
export async function checkDeployment(options: Options) {
  const origin = exactOrigin(options.url, options.allowLocal);
  const requestOrigin = options.origin ? exactOrigin(options.origin, options.allowLocal) : origin;
  const checks: Check[] = [];
  let cookieObserved = false;
  let assetsChecked = 0;
  const deadline = AbortSignal.timeout(60_000);
  const check = async (id: string, expectation: string, run: () => Promise<void>) => {
    try {
      await run();
      checks.push({ id, passed: true, expectation });
      return true;
    } catch (error) {
      checks.push({
        id,
        passed: false,
        expectation,
        failure: error instanceof CheckFailure ? error.message : 'request-or-protocol-failed',
      });
      return false;
    }
  };
  const safeFetch: typeof fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    must(url.origin === origin && !url.username && !url.password, 'unexpected-request-origin');
    must(['GET', 'POST', 'OPTIONS'].includes(method), 'unexpected-request-method');
    // The only POSTs are public MCP JSON-RPC; no challenge, registration or relay mutations.
    must(method !== 'POST' || url.pathname === '/mcp', 'unexpected-post-path');
    const response = await fetch(input, {
      ...init,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([
        deadline,
        AbortSignal.timeout(TIMEOUT),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
    cookieObserved ||= response.headers.has('set-cookie');
    must(Number(response.headers.get('content-length') ?? 0) <= LIMIT, 'response-too-large');
    if (!response.body) return response;
    let bytes = 0;
    return new Response(
      response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            must(bytes <= LIMIT, 'response-too-large');
            controller.enqueue(chunk);
          },
        }),
      ),
      { status: response.status, headers: response.headers },
    );
  };
  const get = (path: string, method = 'GET') =>
    safeFetch(origin + path, { method, headers: { Origin: requestOrigin } });
  const json = async (path: string) => {
    const response = await get(path);
    must(response.status === 200, 'expected-http-200');
    must(response.headers.get('content-type')?.includes('application/json'), 'expected-json');
    return JSON.parse(await limitedText(response)) as unknown;
  };
  await check('public-mode', 'Health reports public-relay and kin/0.1.', async () => {
    const health = await json('/api/health');
    must(
      object(health) &&
        health.ok === true &&
        health.mode === 'public-relay' &&
        health.protocol === 'kin/0.1',
      'expected-public-relay',
    );
  });
  await check('relay-health', 'Relay reports kin-relay/0.1 and encrypted-payloads.', async () => {
    const response = await get('/api/network/health');
    must(response.status === 200, 'expected-http-200');
    must(
      response.headers.get('access-control-allow-origin') === requestOrigin,
      'expected-exact-cors-origin',
    );
    const health: unknown = JSON.parse(await limitedText(response));
    must(
      object(health) &&
        health.ok === true &&
        health.protocol === 'kin-relay/0.1' &&
        health.privacy === 'encrypted-payloads',
      'expected-relay-contract',
    );
  });
  for (const path of ['/api/session', '/api/profile', '/api/export']) {
    await check(
      'private-' + path.slice(5),
      'GET ' + path + ' returns 403 without a cookie.',
      async () => {
        const response = await get(path);
        try {
          must(response.status === 403, 'expected-owner-api-denial');
          must(!response.headers.has('set-cookie'), 'unexpected-cookie');
        } finally {
          await response.body?.cancel(); // Do not read or retain a potentially private response.
        }
      },
    );
  }
  await check(
    'mcp-cors',
    'MCP preflight permits the exact requested origin and public protocol headers.',
    async () => {
      const response = await get('/mcp', 'OPTIONS');
      must(response.status === 204, 'expected-http-204');
      must(
        response.headers.get('access-control-allow-origin') === requestOrigin,
        'expected-exact-cors-origin',
      );
      const methods = response.headers.get('access-control-allow-methods') ?? '';
      const headers = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
      must(methods.includes('GET') && methods.includes('POST'), 'expected-mcp-methods');
      must(
        ['content-type', 'mcp-protocol-version', 'mcp-session-id'].every((name) =>
          headers.includes(name),
        ),
        'expected-mcp-headers',
      );
    },
  );

  const client = new Client({ name: 'kin-deployment-preflight', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    fetch: safeFetch,
    requestInit: { headers: { Origin: requestOrigin }, redirect: 'error', credentials: 'omit' },
  });
  client.onerror = () => undefined;
  transport.onerror = () => undefined;
  const connected = await check(
    'mcp-initialize',
    'The real SDK completes public MCP initialization.',
    async () => {
      await client.connect(transport, { timeout: TIMEOUT });
    },
  );
  try {
    if (connected) {
      const toolsValid = await check(
        'mcp-tools',
        'Exactly two tools, empty object inputs and read-only annotations.',
        async () => {
          const { tools } = await client.listTools();
          must(
            tools.length === 2 &&
              tools
                .map((tool) => tool.name)
                .sort()
                .join(',') === 'kin_explain_privacy,kin_open_connections',
            'expected-public-tool-set',
          );
          for (const tool of tools) {
            must(
              tool.inputSchema.type === 'object' &&
                Object.keys(tool.inputSchema.properties ?? {}).length === 0 &&
                (tool.inputSchema.required ?? []).length === 0,
              'expected-empty-input',
            );
            must(
              tool.annotations?.readOnlyHint === true &&
                tool.annotations?.destructiveHint === false &&
                tool.annotations?.openWorldHint === false,
              'expected-read-only-annotations',
            );
          }
          const opener = tools.find((tool) => tool.name === 'kin_open_connections')!;
          const ui = opener._meta?.ui;
          must(object(ui) && ui.resourceUri === RESOURCE, 'expected-tool-ui-resource');
        },
      );
      if (toolsValid) {
        await check(
          'mcp-privacy',
          'Privacy tool discloses plaintext keys, visible metadata, consent and current limits.',
          async () => {
            const result = await client.callTool({ name: 'kin_explain_privacy', arguments: {} });
            must(!result.isError, 'public-tool-error');
            const text = result.content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join(' ');
            must(
              [
                /private keys[^.]*plaintext/i,
                /localStorage/i,
                /signed-decision metadata/i,
                /not a verified person/i,
                /no forward secrecy/i,
                /unaudited/i,
                /both owners/i,
              ].every((pattern) => pattern.test(text)),
              'expected-privacy-disclosures',
            );
          },
        );
        await check(
          'mcp-opener',
          'Opening returns only the public workspace/consent result.',
          async () => {
            const result = await client.callTool({ name: 'kin_open_connections', arguments: {} });
            const value = result.structuredContent;
            must(
              !result.isError &&
                object(value) &&
                Object.keys(value).sort().join(',') === 'consent,workspace' &&
                value.workspace === 'kin' &&
                value.consent === 'both-owners-required',
              'expected-public-opener-result',
            );
          },
        );
      }
      await check(
        'mcp-resource',
        'One HTML app resource uses the declared relay origin, CSP and served JS/CSS.',
        async () => {
          const { resources } = await client.listResources();
          must(resources.length === 1 && resources[0].uri === RESOURCE, 'expected-resource-set');
          const { contents } = await client.readResource({ uri: RESOURCE });
          must(contents.length === 1, 'expected-one-html-resource');
          const content = contents[0];
          must(
            content.mimeType === 'text/html;profile=mcp-app' &&
              'text' in content &&
              typeof content.text === 'string',
            'expected-app-html',
          );
          const ui = content._meta?.ui;
          must(
            object(ui) &&
              ui.domain === origin &&
              object(ui.csp) &&
              onlyOrigin(ui.csp.connectDomains, origin) &&
              onlyOrigin(ui.csp.resourceDomains, origin),
            'expected-origin-and-csp',
          );
          const html = content.text;
          must(
            html.includes('window.__KIN_WIDGET__=true') &&
              html.includes('window.__KIN_RELAY__=' + JSON.stringify(origin)),
            'expected-widget-origin',
          );
          const references = [
            ...new Set(
              [
                ...html.matchAll(/\b(?:src|href)=["']([^"']+\.(?:js|css)(?:[?#][^"']*)?)["']/gi),
              ].map((match) => match[1]),
            ),
          ];
          must(references.length >= 2 && references.length <= 20, 'expected-bounded-build-assets');
          must(
            references.some((ref) => ref.endsWith('.js')) &&
              references.some((ref) => ref.endsWith('.css')),
            'expected-js-and-css',
          );
          for (const ref of references) {
            const asset = new URL(ref, origin);
            must(
              ref === asset.href &&
                asset.origin === origin &&
                !asset.username &&
                !asset.password &&
                asset.pathname.startsWith('/assets/') &&
                !asset.search &&
                !asset.hash,
              'expected-trusted-absolute-assets',
            );
            const response = await safeFetch(asset);
            must(response.status === 200, 'expected-served-asset');
            const type = response.headers.get('content-type') ?? '';
            must(
              asset.pathname.endsWith('.css')
                ? type.startsWith('text/css')
                : /^(text|application)\/(javascript|ecmascript)/.test(type),
              'expected-asset-mime',
            );
            must(
              response.headers.get('access-control-allow-origin') === '*' ||
                response.headers.get('access-control-allow-origin') === requestOrigin,
              'expected-public-asset-cors',
            );
            must((await limitedText(response)).trim().length > 0, 'expected-nonempty-asset');
            assetsChecked++;
          }
        },
      );
    }
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined); // Abort local transport only; never terminateSession/DELETE.
  }
  checks.push({
    id: 'public-no-cookies',
    passed: !cookieObserved,
    expectation: 'Public probes issue no Set-Cookie; cookie values are never read or reported.',
  });
  return {
    checkedAtUTC: new Date().toISOString(),
    scope: 'server-contract-only',
    fixtureMode: Boolean(options.allowLocal),
    url: origin,
    clientOrigin: options.origin ?? null,
    testedRequestOrigin: requestOrigin,
    passed: checks.every((check) => check.passed),
    checks,
    assetsChecked,
    limits: [
      'No browser or ChatGPT UI was executed.',
      'No owner credentials, profile, keys, registration, consent, messages, deletion or domain challenge were supplied.',
      'This does not establish human outcomes, security audit, production capacity, publisher verification or official submission approval.',
    ],
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(USAGE);
  const options: Options = { url: '' };
  const seen = new Set<string>();
  try {
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      must(
        ['--url', '--origin', '--output', '--allow-local'].includes(flag) && !seen.has(flag),
        'invalid-options',
      );
      seen.add(flag);
      if (flag === '--allow-local') options.allowLocal = true;
      else {
        const value = args[++i];
        must(value && !value.startsWith('--'), 'missing-option-value');
        if (flag === '--url') options.url = value;
        if (flag === '--origin') options.origin = value;
        if (flag === '--output') options.output = value;
      }
    }
    must(options.url, 'missing-url');
    const report = await checkDeployment(options);
    if (options.output) {
      try {
        await writeFile(resolve(options.output), JSON.stringify(report, null, 2) + '\n', {
          mode: 0o600,
        });
      } catch {
        report.passed = false;
        report.checks.push({
          id: 'report-file',
          passed: false,
          expectation: 'Requested JSON report can be written.',
          failure: 'report-write-failed',
        });
      }
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({
        passed: false,
        scope: 'server-contract-only',
        failure: 'invalid-options-or-unexpected-failure',
        usage: USAGE,
      }),
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
