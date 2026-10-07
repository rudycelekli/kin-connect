#!/usr/bin/env node
/** Rebuild Kin's on-disk ADR index. No external service or AgentDB is required. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'docs/adr');
const files = (await readdir(directory)).filter((name) => /^\d{4}-.+\.md$/.test(name)).sort();
const nodes = [];
const edges = [];
for (const name of files) {
  const source = await readFile(resolve(directory, name), 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  if (!frontmatter) throw new Error(`Missing ADR frontmatter: ${name}`);
  const field = (key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter)?.[1].trim();
  const id = field('id');
  const title = field('title');
  const status = field('status');
  const date = field('date');
  if (!id || !/^ADR-\d{4}$/.test(id) || !title || !status || !date)
    throw new Error(`Incomplete ADR metadata: ${name}`);
  nodes.push({ id, title, status, date, file: `docs/adr/${name}` });
  for (const relation of ['depends-on', 'related', 'amends', 'supersedes']) {
    const value = field(relation);
    for (const to of value?.match(/ADR-\d{4}/g) ?? []) edges.push({ from: id, to, relation });
  }
}
const ids = new Set(nodes.map((node) => node.id));
if (ids.size !== nodes.length) throw new Error('Duplicate ADR IDs');
for (const edge of edges)
  if (!ids.has(edge.to)) throw new Error(`Dangling ADR relationship: ${edge.from} → ${edge.to}`);
const dependencies = new Map(
  nodes.map((node) => [
    node.id,
    edges
      .filter((edge) => edge.from === node.id && edge.relation === 'depends-on')
      .map((edge) => edge.to),
  ]),
);
const seen = new Set();
const visiting = new Set();
function visit(id) {
  if (visiting.has(id)) throw new Error(`Cyclic ADR dependency at ${id}`);
  if (seen.has(id)) return;
  visiting.add(id);
  for (const dependency of dependencies.get(id)) visit(dependency);
  visiting.delete(id);
  seen.add(id);
}
for (const id of ids) visit(id);
const graph = { version: 1, persistence: 'on-disk-only', nodes, edges };
const row = (node) =>
  `| [${node.id}](../${node.file}) | ${node.title} | ${node.status} | ${node.date} |`;
const lines = [
  '# Architecture decisions',
  '',
  'Accepted decisions describe the fictional reference, optional local integrations, and separate real owner network. Rebuild this index with `node scripts/adr-index.mjs`; verify it with `node scripts/adr-index.mjs --check`.',
  '',
  'This index and [its JSON graph](adr-index.json) are stored on disk. Ruflo AgentDB persistence is separate and is not claimed by this script.',
  '',
  '| Decision | Title | Status | Date |',
  '| --- | --- | --- | --- |',
  ...nodes.map(row),
  '',
  '```mermaid',
  'graph TD',
  ...nodes.map((node) => `  ${node.id.replace('-', '_')}["${node.id}"]`),
  ...edges
    .filter((edge) => edge.relation === 'depends-on')
    .map((edge) => `  ${edge.from.replace('-', '_')} -->|depends on| ${edge.to.replace('-', '_')}`),
  '```',
  '',
];
const outputs = [
  ['docs/adr-index.json', JSON.stringify(graph, null, 2) + '\n'],
  ['docs/decisions.md', lines.join('\n')],
];
for (const [file, content] of outputs) {
  const path = resolve(root, file);
  if (process.argv.includes('--check')) {
    let existing = '';
    try {
      existing = await readFile(path, 'utf8');
    } catch {}
    if (existing !== content)
      throw new Error(`Stale ADR index: run node scripts/adr-index.mjs (${file})`);
  } else await writeFile(path, content);
}
console.log(
  `${nodes.length} ADRs, ${edges.length} relationships; no dangling references or dependency cycles. ${process.argv.includes('--check') ? 'Index verified.' : 'On-disk index written.'}`,
);
