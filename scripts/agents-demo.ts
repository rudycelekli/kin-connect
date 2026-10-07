import {
  demoProfile,
  discover,
  FIXTURES,
  runNegotiation,
  transitionMatch,
} from '../src/matchmaking/index.js';
import type { Intent } from '../src/shared/types.js';

const args = process.argv.slice(2);
const requested = args.find((arg) => !arg.startsWith('--')) ?? 'friendship';
if (!['friendship', 'dating', 'collaboration'].includes(requested)) {
  console.error('Usage: npm run demo:agents -- friendship|dating|collaboration [--wire]');
  process.exit(1);
}

const profile = demoProfile();
const result = discover(profile, requested as Intent);
console.log('Kin · agents connecting people');
console.log('Deterministic policy-agent simulation · fictional adults · no model calls');
console.log(
  `${result.considered} considered · ${result.excluded} policy/availability exclusions · ${result.matches.length} suggestions`,
);
const match = result.matches[0];
if (!match) process.exit(0);
console.log(
  `\n${profile.name} ↔ ${match.person.name} · ${requested} · ${match.score}/100 preference score`,
);
console.log(match.reasons.join(' · '));
for (const message of match.messages)
  console.log(`\n${message.from} → ${message.to} [${message.kind}]\n${message.text}`);
if (args.includes('--wire')) {
  const peer = FIXTURES.find((candidate) => candidate.id === match.person.id)!;
  console.log('\nActual local JSON wire messages (kin/0.1; two independent policy agents):');
  for (const message of runNegotiation(profile, peer, requested as Intent).exchange)
    console.log(JSON.stringify(message));
}
const waiting = transitionMatch(match, 'approve');
console.log(`\nDemonstrating a separate first-owner approval: ${waiting.state}.`);
console.log(
  `Peer consent: ${waiting.peerApproved}. A second explicit owner action is still required.`,
);
console.log('No introduction was sent; this is a local simulation.');
