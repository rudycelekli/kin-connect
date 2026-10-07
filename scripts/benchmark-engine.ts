import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessOpportunity,
  demoProfile,
  OPPORTUNITY_VERSION,
  runNegotiation,
  negotiate,
  discoverWithCandidates,
} from '../src/matchmaking/index.js';
import type { Intent, OwnerProfile } from '../src/shared/types.js';
import { interestKey, normalizedCity } from '../src/matchmaking/index.js';

const intentions: Intent[] = ['friendship', 'dating', 'collaboration'];
function syntheticPair(): [OwnerProfile, OwnerProfile] {
  const owner: OwnerProfile = {
    ...demoProfile(),
    id: 'synthetic-a',
    name: 'Fictional A',
    city: 'Example City',
    interests: ['Books', 'Coffee'],
    values: ['Curiosity', 'Kindness'],
    requirements: {
      minAge: 18,
      maxAge: 80,
      sameCity: true,
      nonsmoker: false,
      datingGenders: ['woman', 'man', 'nonbinary', 'self-described'],
    },
    boundaries: 'SYNTHETIC-PRIVATE-NOTE',
  };
  return [owner, { ...structuredClone(owner), id: 'synthetic-b', name: 'Fictional B' }];
}
/** Frozen pre-upgrade preference formula, only for already-eligible synthetic pairs. */
function legacyScore(owner: OwnerProfile, peer: OwnerProfile): number {
  const interests = owner.interests.filter((label) =>
    peer.interests.some((item) => interestKey(item) === interestKey(label)),
  ).length;
  const values = owner.values.filter((value) => peer.values.includes(value)).length;
  const windows = owner.availability.filter((slot) => peer.availability.includes(slot)).length;
  const energy =
    owner.energy === peer.energy
      ? 3
      : owner.energy === 'balanced' || peer.energy === 'balanced'
        ? 2
        : 0;
  return (
    52 +
    Math.min(interests * 6, 24) +
    Math.min(values * 4, 12) +
    Math.min(windows * 2, 4) +
    (normalizedCity(owner.city) === normalizedCity(peer.city) ? 3 : 0) +
    energy
  );
}
function measured(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    iterations: samples.length,
    medianMilliseconds: round(sorted[Math.floor(sorted.length / 2)]),
    p95Milliseconds: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
  };
}

export function runEngineBenchmark() {
  const cases: Array<{ id: string; intent: Intent; passed: boolean }> = [];
  const targetedRankingCases: Array<{
    id: string;
    intent: Intent;
    currentPassed: boolean;
    legacyPassed: boolean;
  }> = [];
  const add = (id: string, intent: Intent, passed: boolean) => cases.push({ id, intent, passed });
  for (const intent of intentions) {
    const [owner, peer] = syntheticPair();
    const broad = {
      ...peer,
      interests: ['Books', 'Coffee', ...Array.from({ length: 10 }, (_, i) => `Other topic ${i}`)],
    };
    const broadRank = assessOpportunity(owner, broad, intent);
    const focusedCases: Array<[string, OwnerProfile]> = [
      ['focused-full-overlap', peer],
      ['focused-single-overlap', { ...peer, interests: ['Books'] }],
    ];
    for (const [id, focused] of focusedCases) {
      const rank = assessOpportunity(owner, focused, intent);
      const passed = rank.eligible && broadRank.eligible && rank.score > broadRank.score;
      add(id, intent, passed);
      targetedRankingCases.push({
        id,
        intent,
        currentPassed: passed,
        legacyPassed: legacyScore(owner, focused) > legacyScore(owner, broad),
      });
    }
    const forward = assessOpportunity(owner, broad, intent),
      reverse = assessOpportunity(broad, owner, intent);
    add(
      'role-symmetry',
      intent,
      forward.eligible &&
        reverse.eligible &&
        forward.score === reverse.score &&
        forward.ownerScore === reverse.peerScore,
    );
    const shuffled = structuredClone(peer);
    shuffled.interests.reverse();
    shuffled.values.reverse();
    shuffled.availability.reverse();
    const before = negotiate(owner, peer, intent),
      after = negotiate(shuffled, owner, intent);
    add(
      'list-order-invariance',
      intent,
      !!before &&
        !!after &&
        before.score === after.score &&
        JSON.stringify(before.plan) === JSON.stringify(after.plan),
    );
    add(
      'owner-hard-age-gate',
      intent,
      !assessOpportunity(owner, { ...peer, age: 81 }, intent).eligible,
    );
    add(
      'peer-hard-age-gate',
      intent,
      !assessOpportunity(
        owner,
        { ...peer, requirements: { ...peer.requirements, minAge: 40 } },
        intent,
      ).eligible,
    );
    add(
      'no-common-window',
      intent,
      !assessOpportunity(owner, { ...peer, availability: ['weekday-days'] }, intent).eligible,
    );
    add(
      'sparse-overlap-is-not-rejection',
      intent,
      !!negotiate(owner, { ...peer, interests: ['Running'], values: ['Honesty'] }, intent),
    );
    const remoteOwner = { ...owner, requirements: { ...owner.requirements, sameCity: false } };
    const remotePeer = {
      ...peer,
      city: 'Another City',
      requirements: { ...peer.requirements, sameCity: false },
    };
    const remote = negotiate(remoteOwner, remotePeer, intent);
    add(
      'remote-plan-with-mutual-permission',
      intent,
      !!remote && /online conversation/.test(remote.plan.detail),
    );
    const match = negotiate(owner, peer, intent);
    add(
      'agents-cannot-approve',
      intent,
      !!match && match.state === 'suggested' && !match.ownerApproved && !match.peerApproved,
    );
    const duplicate = discoverWithCandidates(owner, intent, [peer, { ...peer, age: 50 }]);
    add(
      'duplicate-identity-denied',
      intent,
      duplicate.matches.length === 0 && duplicate.excluded === 2,
    );
    const serialized = JSON.stringify({ match, remote, forward });
    add('private-note-not-in-result', intent, !serialized.includes(owner.boundaries));
  }
  const careerPairs = [
    ['Career: peer learning', 'Career: peer learning', 'peer-learning'],
    ['Career: find a mentor', 'Career: offer mentorship', 'mentorship'],
    ['Career: explore jobs', 'Career: hiring', 'job-exploration'],
    ['Career: find a cofounder', 'Career: find a cofounder', 'cofounder'],
    ['Career: raise funding', 'Career: investing', 'funding'],
  ] as const;
  for (const [firstGoal, secondGoal, kind] of careerPairs) {
    const [first, second] = syntheticPair();
    first.interests = [firstGoal];
    second.interests = [secondGoal];
    const forward = negotiate(first, second, 'collaboration');
    const reverse = negotiate(second, first, 'collaboration');
    add(
      `career-${kind}-bilateral-plan`,
      'collaboration',
      !!forward &&
        !!reverse &&
        forward.ranking?.career?.connections[0].kind === kind &&
        JSON.stringify(forward.plan) === JSON.stringify(reverse.plan) &&
        !forward.ownerApproved &&
        !forward.peerApproved,
    );
    const rank = forward?.ranking;
    add(
      `career-${kind}-bounded-no-double-count`,
      'collaboration',
      !!rank &&
        rank.score <= 100 &&
        Number.isFinite(rank.score) &&
        rank.signals.find((signal) => signal.id === 'interests')?.contribution === 0 &&
        rank.signals.find((signal) => signal.id === 'career')?.contribution === 25,
    );
    add(
      `career-${kind}-hard-gate`,
      'collaboration',
      !assessOpportunity(first, { ...second, paused: true }, 'collaboration').eligible,
    );
    if (firstGoal !== secondGoal) {
      const sameSided = negotiate(first, { ...second, interests: [firstGoal] }, 'collaboration');
      add(
        `career-${kind}-complementary-over-same-role`,
        'collaboration',
        !!forward &&
          !!sameSided &&
          forward.score > sameSided.score &&
          sameSided.ranking?.career?.connections.length === 0,
      );
    }
  }
  const [owner, peer] = syntheticPair();
  // Warm the pure engine; these timings exclude HTTP, encryption, storage and browser UI.
  for (let i = 0; i < 20; i++) assessOpportunity(owner, peer, 'friendship');
  const scoring: number[] = [],
    negotiation: number[] = [];
  for (let i = 0; i < 300; i++) {
    const start = performance.now();
    assessOpportunity(owner, peer, 'friendship');
    scoring.push(performance.now() - start);
  }
  for (let i = 0; i < 50; i++) {
    const start = performance.now();
    runNegotiation(owner, peer, 'friendship');
    negotiation.push(performance.now() - start);
  }
  return {
    checkedAtUTC: new Date().toISOString(),
    engineVersion: OPPORTUNITY_VERSION,
    scope: 'curated-synthetic-engine-regression-only',
    syntheticProfilesOnly: true,
    actualHumanOutcomesMeasured: false,
    networkOrChatGPTHostTested: false,
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    passed: cases.every((item) => item.passed),
    casesPassed: cases.filter((item) => item.passed).length,
    caseCount: cases.length,
    cases,
    targetedRankingComparison: {
      purpose:
        'Six deliberately constructed counterexamples to raw shared-label-count ordering, not an unbiased human-matchmaking evaluation.',
      caseCount: targetedRankingCases.length,
      currentPassed: targetedRankingCases.filter((item) => item.currentPassed).length,
      legacyPassed: targetedRankingCases.filter((item) => item.legacyPassed).length,
      cases: targetedRankingCases,
    },
    localTiming: { scoring: measured(scoring), sixMessageNegotiation: measured(negotiation) },
    limits: [
      'Normative regression scenarios cannot establish better meetings, romantic prediction, fairness across populations, or a 100x improvement.',
      'Weights are uncalibrated product choices. Broad-interest owners may be ranked lower; pilot feedback must evaluate that tradeoff.',
      'Timings are local synchronous measurements, not relay throughput, production latency, or a performance comparison against the legacy engine.',
      'No actual owner profiles, keys, chat history, or external services were used.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1]))
    throw new Error('Usage: npm run benchmark:engine -- [--output <report.json>]');
  const report = runEngineBenchmark();
  const output = resolve(args[1] ?? 'artifacts/engine-benchmark.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        scope: report.scope,
        casesPassed: report.casesPassed,
        caseCount: report.caseCount,
        rankingComparison: report.targetedRankingComparison,
        localTiming: report.localTiming,
        output,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
