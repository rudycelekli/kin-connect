import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const supplied = process.argv[2];
if (!supplied)
  throw new Error('Usage: node plugins/kin/scripts/configure.mjs https://your-kin-host/mcp');
const endpoint = new URL(supplied);
if (
  endpoint.protocol !== 'https:' ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  endpoint.hostname.endsWith('.invalid')
) {
  throw new Error('Use an actual HTTPS MCP endpoint with no credentials, query, or fragment.');
}
const template = JSON.parse(
  await readFile(new URL('../mcp.template.json', import.meta.url), 'utf8'),
);
template.mcpServers.kin.url = endpoint.href;
const destination = new URL('../mcp.json', import.meta.url);
await writeFile(destination, `${JSON.stringify(template, null, 2)}\n`);
console.log(
  `Configured ${fileURLToPath(destination)} for ${endpoint.origin}. Verify the endpoint before distributing.`,
);
