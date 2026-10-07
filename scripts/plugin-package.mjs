#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = resolve(root, 'plugins/kin');
const draft = process.argv.includes('--draft');
if (process.argv.slice(2).some((arg) => arg !== '--draft'))
  throw new Error('Usage: node scripts/plugin-package.mjs [--draft]');
const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'plugin.json'), 'utf8'));
const fail = (message) => {
  throw new Error(`Kin plugin: ${message}`);
};
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value, allowed, context) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${context} must be an object.`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`Unsupported ${context} field: ${key}`);
};
exactKeys(
  manifest,
  [
    '$schema',
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
    'extensions',
  ],
  'manifest',
);
if (
  manifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' ||
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name) ||
  manifest.name.length > 64
)
  fail('Use the portable schema and a valid stable name.');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('Use a semantic release version.');
const extension = manifest.extensions?.['com.openai'];
exactKeys(extension, ['interface', 'onboardingSkill', 'review', 'publication'], 'OpenAI extension');
if (extension.publication !== undefined) {
  exactKeys(extension.publication, ['release_notes'], 'publication');
  if (!nonempty(extension.publication.release_notes))
    fail('Publication release_notes must be a nonempty string.');
}
const presentation = extension.interface;
exactKeys(
  presentation,
  [
    'displayName',
    'shortDescription',
    'longDescription',
    'developerName',
    'category',
    'capabilities',
    'websiteURL',
    'supportURL',
    'privacyPolicyURL',
    'termsOfServiceURL',
    'defaultPrompt',
    'brandColor',
    'composerIcon',
    'logo',
  ],
  'interface',
);
for (const [field, max] of Object.entries({
  displayName: 30,
  shortDescription: 30,
  longDescription: 4000,
  developerName: 80,
  category: 120,
})) {
  if (!nonempty(presentation[field]) || presentation[field].length > max) fail(`Invalid ${field}.`);
}
function publicURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.hostname.endsWith('.invalid')
  )
    fail('Use real public HTTPS URLs without credentials.');
  return url;
}
for (const field of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  if (!nonempty(presentation[field]) || presentation[field].length > 1024)
    fail(`Invalid ${field}.`);
  publicURL(presentation[field]);
}
if (
  !Array.isArray(presentation.capabilities) ||
  presentation.capabilities.length > 20 ||
  presentation.capabilities.some((value) => !nonempty(value) || value.length > 120)
)
  fail('Invalid capabilities.');
if (
  !Array.isArray(presentation.defaultPrompt) ||
  presentation.defaultPrompt.length > 3 ||
  presentation.defaultPrompt.some((value) => !nonempty(value) || value.length > 128)
)
  fail('Invalid starter prompts.');
if (!/^#[a-f0-9]{6}$/i.test(presentation.brandColor)) fail('Invalid brand color.');
const skillPath = './skills/find-your-people/SKILL.md';
if (extension.onboardingSkill !== skillPath) fail('Unexpected onboarding skill path.');
if (presentation.logo !== './assets/icon.svg' || presentation.composerIcon !== './assets/icon.svg')
  fail('Unexpected icon paths.');
const skill = await readFile(resolve(pluginRoot, skillPath), 'utf8');
if (!/^---\r?\nname: find-your-people\r?\ndescription: [^\n]+\r?\n---/.test(skill))
  fail('Skill metadata is missing or inconsistent.');
const icon = await readFile(resolve(pluginRoot, 'assets/icon.svg'));
if (
  icon.length > 5 * 1024 * 1024 ||
  !/width="128" height="128" viewBox="0 0 128 128"/.test(icon.toString())
)
  fail('Expected square 128px SVG icon below 5 MiB.');
const cases = extension.review?.test_cases;
if (cases?.positive?.length !== 5 || cases?.negative?.length !== 3)
  fail('Draft review requires five positive and three negative cases.');
for (const item of [...cases.positive, ...cases.negative]) {
  exactKeys(item, ['description', 'prompt', 'tools_triggered', 'expected_behavior'], 'review case');
  if (!nonempty(item.description) || !nonempty(item.prompt))
    fail('Review cases need descriptions and prompts.');
}
for (const item of cases.positive)
  if (
    !nonempty(item.tools_triggered) ||
    !nonempty(item.expected_behavior) ||
    item.tools_triggered
      .split(',')
      .some((tool) => !['kin_open_connections', 'kin_explain_privacy'].includes(tool.trim()))
  )
    fail('Positive cases must name implemented tools and expected behavior.');
for (const item of cases.negative)
  if (!nonempty(item.expected_behavior))
    fail('Negative cases must describe the expected refusal, clarification, or safe fallback.');

let mcp;
if (!draft) {
  try {
    mcp = JSON.parse(await readFile(resolve(pluginRoot, 'mcp.json'), 'utf8'));
  } catch {
    fail(
      'Configure an actual HTTPS endpoint with plugins/kin/scripts/configure.mjs first, or use --draft for an instructions-only ZIP.',
    );
  }
  exactKeys(mcp, ['$schema', 'mcpServers'], 'MCP config');
  if (mcp.$schema !== 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
    fail('Unexpected MCP schema.');
  exactKeys(mcp.mcpServers, ['kin'], 'MCP servers');
  exactKeys(mcp.mcpServers.kin, ['type', 'url'], 'Kin MCP server');
  if (mcp.mcpServers.kin.type !== 'streamable-http') fail('Use Streamable HTTP.');
  const url = publicURL(mcp.mcpServers.kin.url);
  if (url.search) fail('Keep query strings and credentials out of MCP configuration.');
} else {
  delete extension.review;
  delete extension.publication;
  presentation.longDescription = `Instructions-only draft; no Kin MCP server is configured in this ZIP. ${presentation.longDescription}`;
}

// Deliberate allowlist: no environment files, local state, config templates,
// scripts, screenshots, keys, or files outside this plugin enter the ZIP.
const entries = [
  ['kin/plugin.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
  ['kin/skills/find-your-people/SKILL.md', Buffer.from(skill)],
  ['kin/assets/icon.svg', icon],
  ['kin/LICENSE', await readFile(resolve(root, 'LICENSE'))],
];
if (mcp) entries.push(['kin/mcp.json', Buffer.from(`${JSON.stringify(mcp, null, 2)}\n`)]);
const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let checksum = 0xffffffff;
  for (const byte of buffer) checksum = table[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0;
for (const [name, data] of entries) {
  const encoded = Buffer.from(name),
    checksum = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(((2026 - 1980) << 9) | (10 << 5) | 7, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(encoded.length, 26);
  local.push(header, encoded, data);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x800, 8);
  directory.writeUInt16LE(((2026 - 1980) << 9) | (10 << 5) | 7, 14);
  directory.writeUInt32LE(checksum, 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(encoded.length, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, encoded);
  offset += header.length + encoded.length + data.length;
}
const directorySize = central.reduce((size, data) => size + data.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directorySize, 12);
end.writeUInt32LE(offset, 16);
const output = resolve(root, 'artifacts', draft ? 'kin-plugin-draft.zip' : 'kin-plugin.zip');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([...local, ...central, end]));
const size = (await stat(output)).size;
console.log(
  `${output}: ${entries.length} allowlisted files, ${size} bytes. ${draft ? 'Instructions-only draft, no MCP connection.' : 'Configured MCP draft; deployment and official review remain unverified.'}`,
);
