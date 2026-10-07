import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Code2,
  Heart,
  HeartHandshake,
  Leaf,
  MapPin,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  Availability,
  Gender,
  Intent,
  Match,
  OwnerProfile,
  SessionState,
  SavedConnection,
} from './shared/types';
import { AVAILABILITY_LABELS, INTERESTS, VALUES } from './shared/types';
import Portrait, { FlowerMark } from './components/Portrait';
import { NetworkPanel } from './network/NetworkPanel';
import { CirclesPanel } from './communities-ui/CirclesPanel';
import { SavedConnectionsPanel } from './communities-ui/SavedConnectionsPanel';
import { staticApi } from './static-demo';
import {
  createIntroductionBrief,
  interestKey,
  interestSchema,
  validateProfile,
} from './matchmaking';

const INTENTS: { id: Intent; label: string; icon: typeof Heart }[] = [
  { id: 'friendship', label: 'Friendship', icon: Users },
  { id: 'dating', label: 'Dating', icon: Heart },
  { id: 'collaboration', label: 'Collaboration', icon: Sparkles },
];
const GENDERS: { id: Gender; label: string }[] = [
  { id: 'woman', label: 'Women' },
  { id: 'man', label: 'Men' },
  { id: 'nonbinary', label: 'Nonbinary people' },
  { id: 'self-described', label: 'Self-described' },
];
const EMPTY: SessionState = { profile: null, matches: [], demo: true, searchedAt: null };
const SOURCE_URL = 'https://github.com/rudycelekli/kin-connect';
const INVITE_URL = 'https://rudycelekli.github.io/kin-connect/';
const LOCAL_INSTALL =
  import.meta.env.VITE_STATIC_DEMO !== 'true' &&
  ['127.0.0.1', 'localhost'].includes(location.hostname);
const policyURL = (path: string) =>
  window.__KIN_RELAY__
    ? `${window.__KIN_RELAY__}/${path}`
    : new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;

async function localApi<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  if (!LOCAL_INSTALL) throw new Error('Owner agent pairing is available on your own computer.');
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(typeof data.error === 'string' ? data.error : 'Please try again.');
  return data as T;
}
// Owner intake is device-local, including when the UI is served by a remote relay.
const api = staticApi;

const previewMatches: Match[] = [
  {
    id: 'preview-jules',
    person: {
      id: 'jules',
      name: 'Jules',
      age: 28,
      city: 'Brooklyn',
      bio: 'Museum wanderer. Amateur ceramicist. Always up for a very long coffee.',
      agentName: 'Clover',
      interests: ['Art & design', 'Coffee', 'Books'],
      color: '#d5cbea',
      initials: 'JL',
      illustration: 'flower',
    },
    intent: 'friendship',
    score: 89,
    reasons: [
      'A shared curiosity for art and everyday adventures.',
      'You both prefer a small circle and unhurried conversation.',
    ],
    sharedInterests: ['Art & design', 'Coffee'],
    sharedValues: ['Curiosity', 'Creativity'],
    commonAvailability: ['weekends'],
    messages: [],
    plan: {
      title: 'Coffee, then a gallery?',
      detail: 'An easy first hello around your shared interests.',
      availability: 'weekends',
    },
    state: 'suggested',
    ownerApproved: false,
    peerApproved: false,
  },
  {
    id: 'preview-noah',
    person: {
      id: 'noah',
      name: 'Noah',
      age: 30,
      city: 'Brooklyn',
      bio: 'Good trails, good food, good company. Finding the little adventures close to home.',
      agentName: 'Scout',
      interests: ['Hiking', 'Cooking', 'Photography'],
      color: '#f3d97b',
      initials: 'NR',
      illustration: 'sun',
    },
    intent: 'friendship',
    score: 86,
    reasons: [
      'A love of getting outside, with room for a quieter pace.',
      'Your weekend windows line up.',
    ],
    sharedInterests: ['Hiking', 'Cooking'],
    sharedValues: ['Kindness', 'Adventure'],
    commonAvailability: ['weekends'],
    messages: [],
    plan: {
      title: 'A walk with a good coffee',
      detail: 'A low-key weekend walk in a public park.',
      availability: 'weekends',
    },
    state: 'suggested',
    ownerApproved: false,
    peerApproved: false,
  },
  {
    id: 'preview-aya',
    person: {
      id: 'aya',
      name: 'Aya',
      age: 27,
      city: 'Brooklyn',
      bio: 'Collecting books and new perspectives. Let’s trade a recommendation.',
      agentName: 'Orbit',
      interests: ['Books', 'Film', 'Live music'],
      color: '#edbda5',
      initials: 'AK',
      illustration: 'moon',
    },
    intent: 'friendship',
    score: 84,
    reasons: [
      'Your agents found a shared love of stories.',
      'You both value honest, thoughtful conversation.',
    ],
    sharedInterests: ['Books', 'Film'],
    sharedValues: ['Honesty', 'Curiosity'],
    commonAvailability: ['weekday-evenings'],
    messages: [],
    plan: {
      title: 'Bookshop browsing',
      detail: 'Explore a local bookshop and swap your favorite reads.',
      availability: 'weekday-evenings',
    },
    state: 'suggested',
    ownerApproved: false,
    peerApproved: false,
  },
];

function newProfile(): OwnerProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    age: 25,
    city: '',
    bio: '',
    agentName: 'Clover',
    gender: 'self-described',
    intents: ['friendship'],
    interests: [],
    values: [],
    availability: ['weekends'],
    energy: 'balanced',
    requirements: {
      minAge: 18,
      maxAge: 80,
      sameCity: true,
      nonsmoker: false,
      datingGenders: ['woman', 'man', 'nonbinary', 'self-described'],
    },
    smoking: false,
    boundaries: '',
    paused: false,
  };
}

export default function App() {
  const [session, setSession] = useState<SessionState>(EMPTY);
  const [page, setPage] = useState<'connections' | 'network' | 'circles' | 'agent' | 'how'>(
    new URLSearchParams(location.search).get('kin') === 'network' ? 'network' : 'connections',
  );
  const [intent, setIntent] = useState<Intent>('friendship');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingTarget, setOnboardingTarget] = useState<'connections' | 'network' | 'circles'>(
    'connections',
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(6);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const networkResetRef = useRef<null | (() => Promise<void>)>(null);
  const [searchSummary, setSearchSummary] = useState<{
    considered: number;
    excluded: number;
  } | null>(null);
  const profile = session.profile;
  const currentMatch = session.matches.find((match) => match.id === selected);
  const matches = profile
    ? session.matches.filter(
        (match) => match.intent === intent && !['declined', 'blocked'].includes(match.state),
      )
    : previewMatches;

  useEffect(() => {
    let active = true;
    api<SessionState>('/api/session')
      .then((data) => {
        if (active) {
          setSession(data);
          if (data.profile) setIntent(data.profile.intents[0] || 'friendship');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run<T>(key: string, task: () => Promise<T>, success?: (value: T) => void) {
    setBusy(key);
    setError('');
    try {
      const value = await task();
      success?.(value);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }
  async function discover(nextIntent: Intent = intent) {
    await run(
      'discover',
      async () =>
        api<{ matches: Match[]; considered: number; excluded: number }>('/api/discover', 'POST', {
          intent: nextIntent,
        }),
      (result) => {
        setSession((old) => ({
          ...old,
          matches: result.matches,
          searchedAt: new Date().toISOString(),
        }));
        setSearchSummary(result);
        setNotice(
          `${result.matches.length} thoughtful ${result.matches.length === 1 ? 'connection' : 'connections'} ready to explore.`,
        );
      },
    );
  }
  async function tryDemo() {
    await run(
      'demo',
      () => api<SessionState>('/api/demo', 'POST'),
      (data) => {
        setSession(data);
        setPage('connections');
        setIntent('friendship');
        setSearchSummary(null);
        setNotice('Your fictional demo agent is ready. Take a look around.');
      },
    );
  }
  async function saveProfile(next: OwnerProfile) {
    const saved = await run(
      'profile',
      () => api<SessionState>('/api/profile', 'PUT', next),
      (data) => {
        setSession(data);
        setIntent(next.intents[0]);
        setOnboarding(false);
        setPage(onboardingTarget);
        setNotice('Your private agent profile is saved on this device.');
      },
    );
    if (saved && !next.paused && onboardingTarget === 'connections')
      await discover(next.intents[0]);
  }
  async function action(match: Match, type: 'approve' | 'peer-approve' | 'decline' | 'block') {
    await run(
      type,
      () =>
        api<Match>(`/api/matches/${encodeURIComponent(match.id)}/actions`, 'POST', {
          action: type,
        }),
      (next) => {
        setSession((old) => ({
          ...old,
          matches: old.matches.map((m) =>
            type === 'block' && m.person.id === next.person.id
              ? { ...m, state: 'blocked', ownerApproved: false, peerApproved: false }
              : m.id === next.id
                ? next
                : m,
          ),
          blockedPersonIds:
            type === 'block'
              ? [...new Set([...(old.blockedPersonIds ?? []), next.person.id])]
              : old.blockedPersonIds,
        }));
        if (type === 'decline' || type === 'block') {
          setSelected(null);
          setNotice(
            type === 'block'
              ? 'Person blocked in this session.'
              : 'Introduction declined. Your choice, always.',
          );
        } else if (next.state === 'connected')
          setNotice('Both people said yes. Your introduction is ready.');
      },
    );
  }
  async function pause() {
    if (!profile) return;
    await run(
      'pause',
      () => api<SessionState>('/api/profile', 'PUT', { ...profile, paused: !profile.paused }),
      (data) => {
        setSession(data);
        setNotice(
          data.profile?.paused
            ? 'Your agent is paused. Resume whenever you’re ready.'
            : 'Your agent is ready to explore again.',
        );
      },
    );
  }
  async function share() {
    const shareData = {
      title: 'Kin — Your agent. Your people.',
      text: 'A little less searching. A lot more connection. Explore Kin, an open-source experiment in agents connecting people.',
      url: INVITE_URL,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        setNotice('Kin’s public link copied. Your profile stays private.');
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError'))
        setError(
          'Could not share the link. You can find Kin at github.com/rudycelekli/kin-connect.',
        );
    }
  }
  async function applyToCircle(circleId: string) {
    const result = await run(
      'circle-apply',
      () => api<SessionState>(`/api/circles/${encodeURIComponent(circleId)}/applications`, 'POST'),
      (data) => {
        setSession(data);
        setNotice('Demo application saved on this device. Organizer approval is still required.');
      },
    );
    if (!result)
      throw new Error('Could not save this demo application. Review and retry when ready.');
  }
  async function saveConnection(connection: Omit<SavedConnection, 'savedAt'>) {
    const result = await run(
      'save-connection',
      () => api<SessionState>('/api/saved-connections', 'POST', connection),
      (data) => {
        setSession(data);
        setNotice(
          'Connection saved to your private circle on this device. No invitation or membership was created.',
        );
      },
    );
    if (!result) throw new Error('Could not save this connection on your device.');
  }
  async function removeSavedConnection(peerId: string) {
    const result = await run(
      'remove-saved-connection',
      () => api<SessionState>(`/api/saved-connections/${encodeURIComponent(peerId)}`, 'DELETE'),
      (data) => setSession(data),
    );
    if (!result) throw new Error('Could not remove this saved connection.');
  }
  async function circleAction(
    applicationId: string,
    action: 'simulate-organizer-approval' | 'decline' | 'withdraw',
  ) {
    const result = await run(
      'circle-action',
      () =>
        api<SessionState>(
          `/api/circle-applications/${encodeURIComponent(applicationId)}/actions`,
          'POST',
          { action },
        ),
      (data) => {
        setSession(data);
        setNotice(
          action === 'simulate-organizer-approval'
            ? 'Fictional organizer approval simulated. This demo membership opens no live chat.'
            : 'Demo circle application closed on this device.',
        );
      },
    );
    if (!result) throw new Error('Could not update this demo circle application.');
  }
  async function exportData() {
    await run(
      'export',
      async () => {
        const data = await api<unknown>('/api/export');
        const json = JSON.stringify(data, null, 2);
        if (window.__KIN_WIDGET__) {
          setExportPreview(json);
          return;
        }
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'kin-my-data.json';
        anchor.click();
        URL.revokeObjectURL(url);
      },
      () =>
        setNotice(
          window.__KIN_WIDGET__
            ? 'Your private export is ready to copy. Network chat and device keys are not included.'
            : 'Your profile, demo connections, circle applications, and saved connections are downloaded. Network chat and device keys are not included. Keep it somewhere private.',
        ),
    );
  }
  async function deleteData() {
    await run(
      'delete',
      async () => {
        await networkResetRef.current?.();
        if (LOCAL_INSTALL) await localApi('/api/session', 'DELETE');
        return api('/api/session', 'DELETE');
      },
      () => {
        setSession(EMPTY);
        setDeleteOpen(false);
        setSelected(null);
        setPage('connections');
        setSearchSummary(null);
        setNotice('Your local profile and connections have been deleted.');
      },
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#connections"
          onClick={(event) => {
            event.preventDefault();
            setPage('connections');
          }}
          aria-label="Kin home"
        >
          <FlowerMark />
          <span>
            kin<span className="brand-dot">.</span>
          </span>
        </a>
        <p className="brand-promise">Your agent. Your people.</p>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={page === 'connections' ? 'active' : ''}
            onClick={() => setPage('connections')}
            aria-current={page === 'connections' ? 'page' : undefined}
          >
            <Users size={19} />
            <span>Connections</span>
            {profile && (
              <span className="nav-counter">
                {session.matches.filter((m) => !['blocked', 'declined'].includes(m.state)).length}
              </span>
            )}
          </button>
          <button
            className={page === 'network' ? 'active' : ''}
            onClick={() => setPage('network')}
            aria-current={page === 'network' ? 'page' : undefined}
          >
            <HeartHandshake size={19} />
            <span>Live network</span>
          </button>
          <button
            className={page === 'circles' ? 'active' : ''}
            onClick={() => setPage('circles')}
            aria-current={page === 'circles' ? 'page' : undefined}
          >
            <Users size={19} />
            <span>Circles</span>
          </button>
          <button
            className={page === 'agent' ? 'active' : ''}
            onClick={() => setPage('agent')}
            aria-current={page === 'agent' ? 'page' : undefined}
          >
            <FlowerMark className="nav-flower" />
            <span>My agent</span>
            {profile && <span className={`nav-status ${profile.paused ? 'paused' : ''}`} />}
          </button>
          <button
            className={page === 'how' ? 'active' : ''}
            onClick={() => setPage('how')}
            aria-current={page === 'how' ? 'page' : undefined}
          >
            <CircleHelp size={19} />
            <span>How it works</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="note-flower">
            <FlowerMark />
          </div>
          <p>
            Good people.
            <br />
            Better beginnings.
          </p>
          <span>
            A little help finding
            <br />
            your kind of human.
          </span>
        </div>
        <div className="sidebar-bottom">
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            <Code2 size={16} /> Open source, open hearts <ArrowRight size={14} />
          </a>
          <div className="local-badge">
            <span /> {page === 'network' ? 'Early network' : 'Local demo'}{' '}
            <span className="badge-divider">·</span>{' '}
            {page === 'network'
              ? 'Real owners'
              : page === 'circles'
                ? 'Fictional circles'
                : 'Fictional people'}
          </div>
          {profile && (
            <div className="owner-mini">
              <div className="owner-initial">{profile.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{profile.name}</strong>
                <span>Your space, your pace</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setPage('agent')}
                aria-label="Profile settings"
              >
                <Settings2 size={17} />
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Your little corner of the internet <span>✳</span>
          </div>
          <div className="topbar-actions">
            {window.__KIN_WIDGET__ && (
              <button
                className="text-button"
                onClick={async () => {
                  const host = window.__KIN_HOST__;
                  if (
                    !host ||
                    !host.getHostContext()?.availableDisplayModes?.includes('fullscreen')
                  ) {
                    setNotice('This host keeps Kin inline. You can continue in this workspace.');
                    return;
                  }
                  try {
                    await host.requestDisplayMode({ mode: 'fullscreen' });
                  } catch {
                    setNotice('Fullscreen is unavailable in this host. You can continue inline.');
                  }
                }}
              >
                <Maximize2 size={16} />
                <span>Expand workspace</span>
              </button>
            )}
            <button className="text-button" onClick={share}>
              <Share2 size={16} />
              <span>Invite a friend</span>
            </button>
            <a
              className="source-link"
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="View Kin source code"
            >
              <Code2 size={19} />
            </a>
          </div>
        </header>
        {error && (
          <div className="alert error" role="alert">
            <CircleHelp size={18} />
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <Check size={18} />
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Dismiss notification">
              <X size={16} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading-state">
            <FlowerMark />
            <p>Making a little room for connection…</p>
          </div>
        ) : onboarding ? (
          <Onboarding
            profile={profile}
            busy={busy === 'profile' || busy === 'discover'}
            onSave={saveProfile}
            onCancel={() => setOnboarding(false)}
          />
        ) : page === 'connections' ? (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">CONNECTIONS, WITH INTENTION</div>
                <h1>Your people are out there.</h1>
                <p>Let your agent help you find the ones who feel like you.</p>
              </div>
              {profile ? (
                <button
                  className="button button-secondary discover-button"
                  onClick={() => discover()}
                  disabled={!!busy || profile.paused}
                >
                  <RotateCcw size={16} />
                  {busy === 'discover' ? 'Exploring…' : 'Explore connections'}
                </button>
              ) : (
                <button className="button button-secondary" onClick={() => setOnboarding(true)}>
                  Meet your agent <ArrowRight size={16} />
                </button>
              )}
            </div>
            <div className="intent-row">
              <div className="intent-tabs" role="group" aria-label="Connection intention">
                {INTENTS.map((item) => (
                  <button
                    key={item.id}
                    className={intent === item.id ? 'selected' : ''}
                    onClick={() => {
                      setIntent(item.id);
                      setVisibleLimit(6);
                      if (profile && !profile.paused) void discover(item.id);
                    }}
                    disabled={!!busy || (!!profile && !profile.intents.includes(item.id))}
                    aria-pressed={intent === item.id}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="privacy-caption">
                <ShieldCheck size={15} /> You decide who gets a hello.
              </span>
            </div>
            <section className="hero-banner" aria-label="Your agent. Your people.">
              <div className="hero-copy">
                <div className="hero-kicker">
                  <span /> PEOPLE FIRST. AGENTS SECOND.
                </div>
                <h2>
                  A little less searching.
                  <br />A lot more <em>connection.</em>
                </h2>
                <p>
                  Your agent gets to know you. Their agent gets to know them.
                  <br className="desktop-break" /> Together, they find a reason for you to say
                  hello.
                </p>
                <div className="hero-actions">
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setPage('network');
                      if (!profile) {
                        setOnboardingTarget('network');
                        setOnboarding(true);
                      }
                    }}
                  >
                    Join the network <HeartHandshake size={17} />
                  </button>
                  {!profile ? (
                    <button className="button button-secondary" onClick={tryDemo} disabled={!!busy}>
                      {busy === 'demo' ? 'Getting acquainted…' : 'Try the demo'}{' '}
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <div className="agent-working">
                      <div className="agent-icon">
                        <FlowerMark />
                      </div>
                      <span>
                        <strong>
                          {profile.agentName}{' '}
                          {profile.paused ? 'is taking a breather' : 'has your back'}
                        </strong>
                        <small>
                          {profile.paused
                            ? 'Your agent is paused.'
                            : 'Your boundaries come before every introduction.'}
                        </small>
                      </span>
                    </div>
                  )}
                  <span className="hero-footnote">
                    A human connection.
                    <br />A little agent magic.
                  </span>
                </div>
              </div>
              <OrbitArt />
            </section>
            {profile?.paused && (
              <div className="pause-banner">
                <Pause size={18} />
                <div>
                  <strong>Your agent is taking a breather.</strong>
                  <span>Your suggestions have been reset. Resume to explore again.</span>
                </div>
                <button className="text-button" onClick={pause} disabled={!!busy}>
                  <Play size={15} />
                  Resume agent
                </button>
              </div>
            )}
            <div className="section-heading">
              <div>
                <h2>
                  {profile
                    ? `A few people to ${intent === 'collaboration' ? 'create with' : 'get to know'}`
                    : 'A glimpse of a good beginning'}
                </h2>
                <p>
                  {profile
                    ? searchSummary
                      ? `Your agent considered ${searchSummary.considered} fictional people and respected every hard requirement.`
                      : 'Thoughtful introductions, with a reason behind each one.'
                    : 'Fictional people. Real possibilities. See how your agent makes a connection.'}
                </p>
              </div>
              <span className="sample-label">
                <span /> {profile ? 'DEMO CONNECTIONS' : 'ILLUSTRATIVE PREVIEW'}
              </span>
            </div>
            {profile && matches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Leaf size={30} />
                </div>
                <h3>A little space for the right people.</h3>
                <p>
                  {session.searchedAt
                    ? 'No introductions meet your current requirements. You can edit your agent or explore another intention.'
                    : 'Your agent is ready to look. Explore connections when it feels right.'}
                </p>
                <button className="button button-secondary" onClick={() => setOnboarding(true)}>
                  Edit my agent <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="matches-grid">
                {matches.slice(0, visibleLimit).map((match, index) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    index={index}
                    preview={!profile}
                    busy={!!busy}
                    onOpen={() => (profile ? setSelected(match.id) : void tryDemo())}
                    onApprove={() => action(match, 'approve')}
                  />
                ))}
              </div>
            )}
            {profile && matches.length > visibleLimit && (
              <button
                className="button button-secondary more-connections"
                onClick={() => setVisibleLimit((count) => count + 6)}
              >
                Explore {Math.min(6, matches.length - visibleLimit)} more connections{' '}
                <ArrowRight size={16} />
              </button>
            )}
            <div className="below-cards">
              <div>
                <ShieldCheck size={19} />
                <span>Hard requirements are never traded for a better score.</span>
              </div>
              <button className="text-button" onClick={() => setPage('how')}>
                A peek behind the connection <ArrowRight size={15} />
              </button>
            </div>
            <footer className="page-footer">
              <span>Made for humans. Built in the open.</span>
              <FlowerMark />
              <span>Less swipe. More substance.</span>
            </footer>
          </>
        ) : page === 'network' ? null : page === 'circles' ? (
          <>
            <CirclesPanel
              profile={profile}
              applications={session.circleApplications ?? []}
              busy={!!busy}
              onStart={() => {
                setOnboardingTarget('circles');
                setOnboarding(true);
              }}
              onApply={applyToCircle}
              onAction={circleAction}
            />
            <SavedConnectionsPanel
              connections={session.savedConnections ?? []}
              busy={!!busy}
              onRemove={removeSavedConnection}
            />
          </>
        ) : page === 'agent' ? (
          <AgentPage
            profile={profile}
            busy={!!busy}
            onCreate={() => setOnboarding(true)}
            onPause={pause}
            onExport={exportData}
            onDelete={() => setDeleteOpen(true)}
            onImport={async (next) => {
              const result = await run(
                'import',
                () => api<SessionState>('/api/profile', 'PUT', next),
                (data) => {
                  setSession(data);
                  setNotice(
                    'Reviewed preferences saved on this device. Rejoin the network to use them.',
                  );
                },
              );
              if (!result) throw new Error('Could not save reviewed preferences.');
            }}
          />
        ) : (
          <HowItWorks onStart={() => (profile ? setPage('connections') : setOnboarding(true))} />
        )}
        <div hidden={page !== 'network' || onboarding || loading}>
          <NetworkPanel
            onSaveConnection={saveConnection}
            onForgetConnection={removeSavedConnection}
            onResetReady={(reset) => {
              networkResetRef.current = reset;
            }}
            profile={profile}
            onCreateProfile={() => {
              setOnboardingTarget('network');
              setOnboarding(true);
            }}
          />
        </div>
        <footer className="trust-footer" aria-label="Kin policies">
          <a href={policyURL('privacy.html')} target="_blank" rel="noreferrer">
            Privacy &amp; consent
          </a>
          <a href={policyURL('terms.html')} target="_blank" rel="noreferrer">
            Prototype terms
          </a>
          <a href={policyURL('support.html')} target="_blank" rel="noreferrer">
            Support
          </a>
        </footer>
      </main>
      {currentMatch && (
        <MatchDialog
          match={currentMatch}
          owner={profile!}
          busy={!!busy}
          onClose={() => setSelected(null)}
          onAction={(type) => action(currentMatch, type)}
        />
      )}
      {deleteOpen && (
        <Dialog
          title="Make a fresh start?"
          onClose={() => setDeleteOpen(false)}
          className="confirmation-dialog"
        >
          <div className="dialog-body">
            <p>
              This leaves your remembered network relays, removes their public capsules and queued
              conversations, and deletes this browser’s profile, demo history, circle applications,
              saved connections, and device keys. Copies already received by another person cannot
              be erased. If a relay is unavailable, keep your keys and retry deletion later.
            </p>
            <div className="confirmation-actions">
              <button className="button button-secondary" onClick={() => setDeleteOpen(false)}>
                Keep my data
              </button>
              <button className="button button-danger" disabled={!!busy} onClick={deleteData}>
                <Trash2 size={16} />
                {busy === 'delete' ? 'Deleting…' : 'Delete my data'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {exportPreview !== null && (
        <Dialog
          title="Your private Kin export"
          onClose={() => setExportPreview(null)}
          className="confirmation-dialog"
        >
          <div className="dialog-body">
            <p>
              This contains your private profile, demo history, circle applications, and saved
              connection aliases. Select and copy it into a private JSON file. It is not uploaded or
              sent to the assistant.
            </p>
            <textarea
              className="private-export-text"
              ref={exportRef}
              readOnly
              value={exportPreview}
              rows={10}
              aria-label="Your private export JSON"
              spellCheck={false}
            />
            <div className="confirmation-actions">
              <button className="button button-secondary" onClick={() => setExportPreview(null)}>
                Close export
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  exportRef.current?.focus();
                  exportRef.current?.select();
                }}
              >
                Select export text
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function OrbitArt() {
  return (
    <div className="orbit-art" aria-hidden="true">
      <div className="orbit-line orbit-one" />
      <div className="orbit-line orbit-two" />
      <div className="orbit-core">
        <FlowerMark />
      </div>
      <div className="orbit-person orbit-person-one">
        <Portrait kind="flower" />
      </div>
      <div className="orbit-person orbit-person-two">
        <Portrait kind="sun" />
      </div>
      <div className="orbit-person orbit-person-three">
        <Portrait kind="moon" />
      </div>
      <div className="orbit-caption caption-one">
        <Heart size={13} fill="currentColor" /> a shared spark
      </div>
      <div className="orbit-caption caption-two">
        <MessageCircle size={13} /> an easy hello
      </div>
      <svg className="orbit-star star-one" viewBox="0 0 32 32">
        <path d="M16 0l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="currentColor" />
      </svg>
      <svg className="orbit-star star-two" viewBox="0 0 32 32">
        <path d="M16 0l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="currentColor" />
      </svg>
      <span className="orbit-dot dot-one" />
      <span className="orbit-dot dot-two" />
    </div>
  );
}

function MatchCard({
  match,
  index,
  preview,
  busy,
  onOpen,
  onApprove,
}: {
  match: Match;
  index: number;
  preview: boolean;
  busy: boolean;
  onOpen: () => void;
  onApprove: () => void;
}) {
  const connected = match.state === 'connected',
    pending = match.state === 'awaiting-peer';
  return (
    <article className={`match-card card-${index % 3}`}>
      <div className="portrait-wrap">
        <Portrait kind={match.person.illustration} color={match.person.color} />
        <span className="portrait-badge">
          <FlowerMark />
          {connected ? 'Both said yes' : pending ? 'Your yes is in' : 'Agent introduction'}
        </span>
        <span className="portrait-number">0{index + 1}</span>
      </div>
      <div className="match-card-body">
        <div className="person-heading">
          <h3>
            {match.person.name}
            <span>, {match.person.age}</span>
          </h3>
          <MapPin size={14} />
          <span>{match.person.city}</span>
        </div>
        <p className="person-bio">{match.person.bio}</p>
        <div className="interest-tags">
          {match.sharedInterests.slice(0, 3).map((interest) => (
            <span key={interest}>{interest}</span>
          ))}
        </div>
        <div className="agent-note">
          <FlowerMark />
          <div>
            <span>WHY YOUR AGENTS CLICKED</span>
            <p>{match.reasons[0] || 'Your agents found something worth exploring.'}</p>
          </div>
        </div>
        <button className="conversation-link" onClick={onOpen}>
          <MessageCircle size={15} />
          {preview ? 'See an agent introduction' : 'Read the agent conversation'}
          <ArrowRight size={15} />
        </button>
        <div className="match-card-footer">
          <span className={`match-status ${connected ? 'connected' : ''}`}>
            <span />
            {connected ? 'Introduction ready' : pending ? 'Waiting for their yes' : 'Worth a hello'}
          </span>
          <button
            className="intro-button"
            disabled={busy || pending || connected}
            onClick={preview ? onOpen : onApprove}
          >
            {connected ? (
              <>
                <CheckCheck size={15} />
                Connected
              </>
            ) : pending ? (
              <>
                <Clock3 size={15} />
                Pending
              </>
            ) : (
              <>
                Say hello <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function AgentPage({
  profile,
  busy,
  onCreate,
  onPause,
  onExport,
  onDelete,
  onImport,
}: {
  profile: OwnerProfile | null;
  busy: boolean;
  onCreate: () => void;
  onPause: () => void;
  onExport: () => void;
  onDelete: () => void;
  onImport: (profile: OwnerProfile) => Promise<void>;
}) {
  return (
    <section className="agent-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE HELP, ALL YOURS</div>
          <h1>Meet your better beginning.</h1>
          <p>Your agent learns what matters to you, and listens to your limits.</p>
        </div>
      </div>
      {!profile ? (
        <div className="agent-welcome">
          <div className="large-agent-icon">
            <FlowerMark />
          </div>
          <h2>Someone in your corner.</h2>
          <p>
            A few questions. A clear set of boundaries. An agent that can make the first
            introduction, while you make every decision.
          </p>
          <button className="button button-primary" onClick={onCreate}>
            Create my agent <ArrowRight size={17} />
          </button>
          <span className="micro-copy">Saved in your local demo. No outside AI service.</span>
        </div>
      ) : (
        <>
          <div className="agent-profile-panel">
            <div className="large-agent-icon">
              <FlowerMark />
            </div>
            <div>
              <div className="eyebrow">{profile.name.toUpperCase()}’S AGENT</div>
              <h2>{profile.agentName}</h2>
              <p>
                {profile.paused ? 'Taking a breather.' : 'Ready to find the good in a new hello.'}
              </p>
              <span className="agent-state">
                <span className={profile.paused ? 'paused' : ''} />
                {profile.paused ? 'Paused' : 'Ready to connect'}
              </span>
            </div>
            <div className="agent-profile-actions">
              <button className="button button-secondary" onClick={onCreate}>
                <Settings2 size={16} />
                Edit my agent
              </button>
              <button className="text-button" onClick={onPause} disabled={busy}>
                {profile.paused ? <Play size={16} /> : <Pause size={16} />}{' '}
                {profile.paused ? 'Resume agent' : 'Pause my agent'}
              </button>
            </div>
          </div>
          <div className="agent-details-grid">
            <div className="detail-panel">
              <div className="panel-heading">
                <HeartHandshake size={21} />
                <h3>What feels like you</h3>
              </div>
              <div className="detail-row">
                <span>Looking for</span>
                <strong>
                  {profile.intents
                    .map((i) => INTENTS.find((item) => item.id === i)?.label)
                    .join(', ')}
                </strong>
              </div>
              <div className="detail-row">
                <span>Your energy</span>
                <strong>{profile.energy}</strong>
              </div>
              <div className="detail-row">
                <span>Room in your week</span>
                <strong>
                  {profile.availability.map((a) => AVAILABILITY_LABELS[a]).join(', ')}
                </strong>
              </div>
              <h4>Small things, shared</h4>
              <div className="interest-tags">
                {profile.interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
              <h4>What you value</h4>
              <div className="interest-tags value-tags">
                {profile.values.map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
            </div>
            <div className="detail-panel boundaries-panel">
              <div className="panel-heading">
                <ShieldCheck size={21} />
                <h3>Hard lines, softly held</h3>
              </div>
              <p>Every person must meet these before your agents start a conversation.</p>
              <ul className="boundary-list">
                <li>
                  <Check size={16} />
                  Age {profile.requirements.minAge}–{profile.requirements.maxAge}
                </li>
                <li>
                  <Check size={16} />
                  {profile.requirements.sameCity
                    ? `Based in ${profile.city}`
                    : 'Open to different cities'}
                </li>
                <li>
                  <Check size={16} />
                  {profile.requirements.nonsmoker ? 'Nonsmokers only' : 'No smoking requirement'}
                </li>
                {profile.intents.includes('dating') && (
                  <li>
                    <Check size={16} />
                    Dating:{' '}
                    {GENDERS.filter((g) => profile.requirements.datingGenders.includes(g.id))
                      .map((g) => g.label)
                      .join(', ')}
                  </li>
                )}
              </ul>
              {profile.boundaries && (
                <div className="personal-boundary">
                  <span>YOUR PERSONAL NOTE</span>
                  <p>{profile.boundaries}</p>
                  <small>For your review. Free-text notes are not evaluated by this demo.</small>
                </div>
              )}
            </div>
          </div>
          <AgentConnection profile={profile} onImport={onImport} />
          <div className="data-panel">
            <div>
              <h3>Your data belongs to you.</h3>
              <p>
                Download a copy or clear your local session at any time. Kin’s demo does not call an
                outside AI service.
              </p>
            </div>
            <div>
              <button className="text-button" disabled={busy} onClick={onExport}>
                <ArrowDownToLine size={16} />
                Export my profile
              </button>
              <button className="text-button danger-text" disabled={busy} onClick={onDelete}>
                <Trash2 size={16} />
                Delete my data
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function HowItWorks({ onStart }: { onStart: () => void }) {
  return (
    <section className="how-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TECHNOLOGY, WITH A HUMAN POINT</div>
          <h1>Agents connect. People decide.</h1>
          <p>A better hello starts with understanding what makes you, you.</p>
        </div>
      </div>
      <div className="how-intro">
        <FlowerMark />
        <h2>
          Your agent. Their agent.
          <br />
          <em>Something in common.</em>
        </h2>
        <p>
          Kin is an open-source experiment in agent-to-agent introductions. Friendship, dating, or
          the person you’ll build something with: connection deserves a little more intention.
        </p>
      </div>
      <div className="how-steps">
        {[
          {
            icon: MessageCircle,
            title: 'Tell your agent what matters.',
            copy: 'Share your interests, availability, and the things you won’t compromise on. Edit them any time.',
          },
          {
            icon: ShieldCheck,
            title: 'Your boundaries come first.',
            copy: 'The matching engine filters hard requirements in both directions. Only eligible agents compare shared interests and values.',
          },
          {
            icon: Sparkles,
            title: 'Agents find a reason to connect.',
            copy: 'Review their structured conversation and the exact reasons for an introduction. No mysterious compatibility promises.',
          },
          {
            icon: HeartHandshake,
            title: 'Two yeses make a hello.',
            copy: 'You approve. They approve. Only then does an introduction become ready, with a simple plan for a first meeting.',
          },
        ].map((step, index) => (
          <article key={step.title}>
            <span className="step-number">0{index + 1}</span>
            <step.icon size={26} />
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </article>
        ))}
      </div>
      <div className="demo-disclosure">
        <div>
          <Code2 size={22} />
          <h3>A working demo, built in the open.</h3>
        </div>
        <p>
          People shown here are fictional. The agents use a transparent, deterministic matching
          engine and structured messages, not a language model. The demo profiles stay in your
          browser. The Live network connects real owners after a separate, explicit opt-in.
        </p>
        <p>
          Matching rules enforce age, city, smoking, and dating gender requirements. Free-text notes
          are there for human review. This demo is for adults aged 18 and over.
        </p>
        <div>
          <button className="button button-primary" onClick={onStart}>
            Find your beginning <ArrowRight size={16} />
          </button>
          <a className="text-button" href={SOURCE_URL} target="_blank" rel="noreferrer">
            Explore the source <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

type OnboardingProps = {
  profile: OwnerProfile | null;
  busy: boolean;
  onSave: (profile: OwnerProfile) => Promise<void>;
  onCancel: () => void;
};
function Onboarding({ profile, busy, onSave, onCancel }: OnboardingProps) {
  const [draft, setDraft] = useState<OwnerProfile>(
    profile ? structuredClone(profile) : newProfile(),
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customInterest, setCustomInterest] = useState('');
  const focusRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    focusRef.current?.focus();
  }, [step]);
  function update<K extends keyof OwnerProfile>(key: K, value: OwnerProfile[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  function requirement<K extends keyof OwnerProfile['requirements']>(
    key: K,
    value: OwnerProfile['requirements'][K],
  ) {
    setDraft((old) => ({ ...old, requirements: { ...old.requirements, [key]: value } }));
  }
  function toggle<K extends 'intents' | 'interests' | 'values' | 'availability'>(
    key: K,
    value: OwnerProfile[K][number],
  ) {
    if (key === 'interests' && !draft.interests.includes(value) && draft.interests.length >= 12) {
      setErrors((old) => ({ ...old, interests: 'Choose up to 12 interests.' }));
      return;
    }
    setDraft((old) => {
      const items = old[key] as string[];
      return {
        ...old,
        [key]: items.includes(value) ? items.filter((item) => item !== value) : [...items, value],
      };
    });
  }
  function addInterest() {
    const result = interestSchema.safeParse(customInterest);
    if (!result.success) {
      setErrors((old) => ({
        ...old,
        customInterest: result.error.issues[0]?.message ?? 'Check this interest.',
      }));
      return;
    }
    if (draft.interests.some((item) => interestKey(item) === interestKey(result.data))) {
      setErrors((old) => ({ ...old, customInterest: 'This interest is already selected.' }));
      return;
    }
    if (draft.interests.length >= 12) {
      setErrors((old) => ({ ...old, customInterest: 'Choose up to 12 interests.' }));
      return;
    }
    update('interests', [...draft.interests, result.data]);
    setCustomInterest('');
    setErrors((old) => ({ ...old, customInterest: '', interests: '' }));
  }
  function validate() {
    const next: Record<string, string> = {};
    if (step === 0) {
      if (!draft.name.trim()) next.name = 'Give us a name to call you.';
      if (!Number.isInteger(draft.age) || draft.age < 18 || draft.age > 120)
        next.age = 'Please enter an age from 18 to 120.';
      if (!draft.city.trim()) next.city = 'Add your city so your agent can match location.';
      if (!draft.agentName.trim()) next.agentName = 'Your agent needs a name.';
    }
    if (step === 1) {
      if (!draft.intents.length) next.intents = 'Choose at least one kind of connection.';
      if (!draft.interests.length) next.interests = 'Choose at least one interest.';
    }
    if (step === 2) {
      if (!draft.values.length) next.values = 'Choose at least one value.';
      if (!draft.availability.length)
        next.availability = 'Choose at least one time that works for you.';
    }
    if (step === 3) {
      if (
        !Number.isInteger(draft.requirements.minAge) ||
        draft.requirements.minAge < 18 ||
        draft.requirements.minAge > 120
      )
        next.minAge = 'Minimum age must be 18–120.';
      if (
        !Number.isInteger(draft.requirements.maxAge) ||
        draft.requirements.maxAge < draft.requirements.minAge ||
        draft.requirements.maxAge > 120
      )
        next.maxAge = 'Maximum must be at least your minimum, and no more than 120.';
      if (draft.intents.includes('dating') && !draft.requirements.datingGenders.length)
        next.datingGenders = 'Choose at least one gender for dating.';
    }
    setErrors(next);
    return !Object.keys(next).length;
  }
  function next() {
    if (validate()) setStep((old) => Math.min(4, old + 1));
  }
  const headings = [
    'A little about you.',
    'What are you hoping to find?',
    'Find your kind of rhythm.',
    'What’s non-negotiable?',
    'Looking like you.',
  ];
  const subtitles = [
    'Your agent starts by listening. We’ll keep it simple.',
    'A new friend, a spark, a creative partner. Make room for what feels right.',
    'The things you value and the time you have make a good beginning.',
    'These are hard requirements. Every introduction must respect them.',
    'Take a look. You can change anything, any time.',
  ];
  function fieldError(key: string) {
    return errors[key] ? (
      <span id={`error-${key}`} className="field-error" role="alert">
        {errors[key]}
      </span>
    ) : null;
  }
  return (
    <section className="onboarding">
      <button className="text-button back-button" onClick={onCancel}>
        <ArrowLeft size={16} />
        Back to {profile ? 'your agent' : 'connections'}
      </button>
      <div className="wizard-topline">
        <span className="eyebrow">{profile ? 'A FRESH PERSPECTIVE' : 'MEET YOUR AGENT'}</span>
        <span>
          0{step + 1} <span>/ 05</span>
        </span>
      </div>
      <div
        className="wizard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={step + 1}
        aria-label={`Step ${step + 1} of 5`}
      >
        {headings.map((_, index) => (
          <span key={index} className={index <= step ? 'filled' : ''} />
        ))}
      </div>
      <h1 ref={focusRef} tabIndex={-1}>
        {headings[step]}
      </h1>
      <p className="wizard-subtitle">{subtitles[step]}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 4) next();
          else
            void onSave({
              ...draft,
              name: draft.name.trim(),
              city: draft.city.trim(),
              agentName: draft.agentName.trim(),
              bio: draft.bio.trim() || 'Looking for a thoughtful new connection.',
              boundaries: draft.boundaries.trim(),
            });
        }}
        noValidate
      >
        {step === 0 && (
          <div className="wizard-fields">
            <div className="form-two-col">
              <label>
                Your name
                <input
                  autoComplete="given-name"
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="What should we call you?"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'error-name' : undefined}
                />
                {fieldError('name')}
              </label>
              <label>
                Your age
                <input
                  type="number"
                  min="18"
                  max="120"
                  value={draft.age || ''}
                  onChange={(e) => update('age', Number(e.target.value))}
                  aria-invalid={!!errors.age}
                  aria-describedby={errors.age ? 'error-age' : undefined}
                />
                {fieldError('age')}
              </label>
            </div>
            <div className="form-two-col">
              <label>
                Your city
                <input
                  autoComplete="address-level2"
                  maxLength={80}
                  value={draft.city}
                  onChange={(e) => update('city', e.target.value)}
                  placeholder="Brooklyn, for example"
                  aria-invalid={!!errors.city}
                  aria-describedby={errors.city ? 'error-city' : undefined}
                />
                {fieldError('city')}
              </label>
              <label>
                How you describe your gender
                <select
                  value={draft.gender}
                  onChange={(e) => update('gender', e.target.value as Gender)}
                >
                  <option value="self-described">Self-described</option>
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                  <option value="nonbinary">Nonbinary</option>
                </select>
                <small>Used only for mutual dating requirements.</small>
              </label>
            </div>
            <label>
              Your agent’s name
              <input
                maxLength={40}
                value={draft.agentName}
                onChange={(e) => update('agentName', e.target.value)}
                aria-invalid={!!errors.agentName}
              />
              {fieldError('agentName')}
            </label>
            <label>
              A line about you <span className="optional">optional</span>
              <textarea
                maxLength={320}
                rows={2}
                value={draft.bio}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="A book lover with a soft spot for Sunday markets…"
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="wizard-fields">
            <fieldset>
              <legend>Make space for…</legend>
              <div className="intent-choice-grid">
                {INTENTS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      draft.intents.includes(item.id) ? 'choice-card chosen' : 'choice-card'
                    }
                    aria-pressed={draft.intents.includes(item.id)}
                    onClick={() => toggle('intents', item.id)}
                  >
                    <item.icon size={24} />
                    <strong>{item.label}</strong>
                    <span>
                      {item.id === 'friendship'
                        ? 'Your kind of company'
                        : item.id === 'dating'
                          ? 'A thoughtful spark'
                          : 'Something worth building'}
                    </span>
                    {draft.intents.includes(item.id) && (
                      <Check size={17} className="choice-check" />
                    )}
                  </button>
                ))}
              </div>
              {fieldError('intents')}
            </fieldset>
            <fieldset>
              <legend>What can you talk about for hours?</legend>
              <p className="fieldset-helper">Choose the interests that feel like you.</p>
              <div className="choice-chips">
                {INTERESTS.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={draft.interests.includes(item) ? 'chosen' : ''}
                    aria-pressed={draft.interests.includes(item)}
                    disabled={draft.interests.length >= 12 && !draft.interests.includes(item)}
                    onClick={() => toggle('interests', item)}
                  >
                    {draft.interests.includes(item) ? <Check size={14} /> : <Plus size={14} />}{' '}
                    {item}
                  </button>
                ))}
              </div>
              <label>
                Add your own interest
                <input
                  maxLength={48}
                  value={customInterest}
                  placeholder="Urban gardening, AI ethics, ceramics…"
                  aria-invalid={!!errors.customInterest}
                  aria-describedby="custom-interest-help"
                  onChange={(event) => setCustomInterest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addInterest();
                    }
                  }}
                />
                <small id="custom-interest-help">
                  Up to 12 interests. Keep contact details out; labels are preferences, not hard
                  requirements.
                </small>
              </label>
              <button
                type="button"
                className="button button-secondary"
                onClick={addInterest}
                disabled={!customInterest.trim()}
              >
                <Plus size={16} /> Add interest
              </button>
              {fieldError('customInterest')}
              <div className="choice-chips">
                {draft.interests
                  .filter((item) => !INTERESTS.includes(item))
                  .map((item) => (
                    <button
                      type="button"
                      key={item}
                      className="chosen"
                      onClick={() => toggle('interests', item)}
                      aria-label={`Remove interest ${item}`}
                    >
                      {item} <X size={14} />
                    </button>
                  ))}
              </div>
              {fieldError('interests')}
            </fieldset>
          </div>
        )}
        {step === 2 && (
          <div className="wizard-fields">
            <fieldset>
              <legend>Good company feels like…</legend>
              <div className="choice-chips values-choices">
                {VALUES.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={draft.values.includes(item) ? 'chosen' : ''}
                    aria-pressed={draft.values.includes(item)}
                    onClick={() => toggle('values', item)}
                  >
                    {draft.values.includes(item) ? <Check size={14} /> : <Plus size={14} />} {item}
                  </button>
                ))}
              </div>
              {fieldError('values')}
            </fieldset>
            <fieldset>
              <legend>When do you have a little room?</legend>
              <div className="availability-options">
                {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((item) => (
                  <label className="check-option" key={item}>
                    <input
                      type="checkbox"
                      checked={draft.availability.includes(item)}
                      onChange={() => toggle('availability', item)}
                    />
                    <Clock3 size={17} />
                    {AVAILABILITY_LABELS[item]}
                  </label>
                ))}
              </div>
              {fieldError('availability')}
            </fieldset>
            <fieldset>
              <legend>Your social energy</legend>
              <div className="energy-options">
                {(['quiet', 'balanced', 'outgoing'] as const).map((item) => (
                  <label className={draft.energy === item ? 'chosen' : ''} key={item}>
                    <input
                      type="radio"
                      name="energy"
                      value={item}
                      checked={draft.energy === item}
                      onChange={() => update('energy', item)}
                    />
                    <strong>{item}</strong>
                    <span>
                      {item === 'quiet'
                        ? 'Slow and small'
                        : item === 'balanced'
                          ? 'A bit of both'
                          : 'Bring on the people'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {step === 3 && (
          <div className="wizard-fields">
            <div className="requirement-note">
              <ShieldCheck size={22} />
              <p>
                These rules are checked in both directions. They can’t be outweighed by shared
                interests.
              </p>
            </div>
            <fieldset>
              <legend>Age range</legend>
              <div className="form-two-col">
                <label>
                  Minimum age
                  <input
                    type="number"
                    min="18"
                    max="120"
                    value={draft.requirements.minAge || ''}
                    onChange={(e) => requirement('minAge', Number(e.target.value))}
                    aria-invalid={!!errors.minAge}
                  />
                  {fieldError('minAge')}
                </label>
                <label>
                  Maximum age
                  <input
                    type="number"
                    min="18"
                    max="120"
                    value={draft.requirements.maxAge || ''}
                    onChange={(e) => requirement('maxAge', Number(e.target.value))}
                    aria-invalid={!!errors.maxAge}
                  />
                  {fieldError('maxAge')}
                </label>
              </div>
            </fieldset>
            <div className="requirement-checks">
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={draft.requirements.sameCity}
                  onChange={(e) => requirement('sameCity', e.target.checked)}
                />
                <span>
                  Only people in my city
                  <small>Uses the city you entered: {draft.city || 'your city'}.</small>
                </span>
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={draft.requirements.nonsmoker}
                  onChange={(e) => requirement('nonsmoker', e.target.checked)}
                />
                <span>Only people who don’t smoke</span>
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={draft.smoking}
                  onChange={(e) => update('smoking', e.target.checked)}
                />
                <span>
                  I smoke<small>Your agent respects the other person’s requirements, too.</small>
                </span>
              </label>
            </div>
            {draft.intents.includes('dating') && (
              <fieldset>
                <legend>For dating, I’m open to…</legend>
                <div className="choice-chips">
                  {GENDERS.map((gender) => (
                    <button
                      type="button"
                      key={gender.id}
                      aria-pressed={draft.requirements.datingGenders.includes(gender.id)}
                      className={
                        draft.requirements.datingGenders.includes(gender.id) ? 'chosen' : ''
                      }
                      onClick={() =>
                        requirement(
                          'datingGenders',
                          draft.requirements.datingGenders.includes(gender.id)
                            ? draft.requirements.datingGenders.filter((g) => g !== gender.id)
                            : [...draft.requirements.datingGenders, gender.id],
                        )
                      }
                    >
                      {gender.label}
                    </button>
                  ))}
                </div>
                {fieldError('datingGenders')}
              </fieldset>
            )}
            <label>
              Anything else to keep in mind? <span className="optional">optional</span>
              <textarea
                rows={3}
                maxLength={500}
                value={draft.boundaries}
                onChange={(e) => update('boundaries', e.target.value)}
                placeholder="A note for you to review before saying yes…"
              />
              <small>
                Personal notes are shown for your review. The demo does not automatically evaluate
                free-text requirements.
              </small>
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="wizard-review">
            <div className="review-agent">
              <div className="agent-icon">
                <FlowerMark />
              </div>
              <div>
                <h2>{draft.agentName}, in your corner.</h2>
                <p>
                  {draft.name}, {draft.age} <span>·</span> {draft.city}
                </p>
              </div>
            </div>
            <div className="review-row">
              <span>Looking for</span>
              <strong>
                {draft.intents.map((i) => INTENTS.find((item) => item.id === i)?.label).join(', ')}
              </strong>
              <button type="button" onClick={() => setStep(1)}>
                Edit
              </button>
            </div>
            <div className="review-row">
              <span>Your interests</span>
              <strong>{draft.interests.join(' · ')}</strong>
              <button type="button" onClick={() => setStep(1)}>
                Edit
              </button>
            </div>
            <div className="review-row">
              <span>Your rhythm</span>
              <strong>{draft.availability.map((a) => AVAILABILITY_LABELS[a]).join(', ')}</strong>
              <button type="button" onClick={() => setStep(2)}>
                Edit
              </button>
            </div>
            <div className="review-row">
              <span>Hard requirements</span>
              <strong>
                Age {draft.requirements.minAge}–{draft.requirements.maxAge}
                {draft.requirements.sameCity ? ` · ${draft.city}` : ''}
                {draft.requirements.nonsmoker ? ' · Nonsmoker' : ''}
              </strong>
              <button type="button" onClick={() => setStep(3)}>
                Edit
              </button>
            </div>
            <div className="review-disclosure">
              <ShieldCheck size={19} />
              <p>
                Your demo agent will compare your profile with fictional demo people. No outside AI
                service. No messages to actual people. You approve every introduction.
              </p>
            </div>
          </div>
        )}
        <div className="wizard-footer">
          <button
            type="button"
            className="text-button"
            onClick={() => (step === 0 ? onCancel() : setStep((old) => old - 1))}
            disabled={busy}
          >
            <ArrowLeft size={16} />
            {step === 0 ? 'Maybe later' : 'Back'}
          </button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy
              ? 'Getting your agent ready…'
              : step === 4
                ? profile
                  ? 'Save my agent'
                  : 'Let’s find my people'
                : 'Continue'}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}

function Dialog({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex="0"]',
          ) || [],
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">A THOUGHTFUL INTRODUCTION</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button className="icon-button close-dialog" onClick={onClose} aria-label="Close dialog">
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MatchDialog({
  match,
  owner,
  busy,
  onClose,
  onAction,
}: {
  match: Match;
  owner: OwnerProfile;
  busy: boolean;
  onClose: () => void;
  onAction: (action: 'approve' | 'peer-approve' | 'decline' | 'block') => Promise<void>;
}) {
  const [tab, setTab] = useState<'overview' | 'conversation'>('overview');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const brief = createIntroductionBrief({
    intent: match.intent,
    sharedInterests: match.sharedInterests,
    sharedValues: match.sharedValues,
    slot: match.plan.availability,
    peerAlias: match.person.agentName,
  });
  return (
    <Dialog title={`You & ${match.person.name}`} onClose={onClose} className="match-dialog">
      <div className="match-dialog-person">
        <div className="small-portrait">
          <Portrait kind={match.person.illustration} color={match.person.color} />
        </div>
        <div>
          <h3>
            {match.person.name}, {match.person.age}
          </h3>
          <span>
            <MapPin size={14} />
            {match.person.city}
            <span>·</span>Fictional demo person
          </span>
          <p>{match.person.bio}</p>
        </div>
      </div>
      <div className="dialog-tabs" role="group" aria-label="Introduction details">
        <button
          className={tab === 'overview' ? 'selected' : ''}
          aria-pressed={tab === 'overview'}
          onClick={() => setTab('overview')}
        >
          The connection
        </button>
        <button
          className={tab === 'conversation' ? 'selected' : ''}
          aria-pressed={tab === 'conversation'}
          onClick={() => setTab('conversation')}
        >
          <MessageCircle size={15} />
          Agent conversation
        </button>
      </div>
      <div className="dialog-body">
        {tab === 'overview' ? (
          <>
            <div className="dialog-section">
              <h3>A little common ground</h3>
              <div className="interest-tags">
                {match.sharedInterests.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="reason-list">
                {match.reasons.map((reason, index) => (
                  <div key={index}>
                    <Sparkles size={16} />
                    <p>{reason}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="requirements-passed">
              <ShieldCheck size={19} />
              <div>
                <strong>Both sets of hard requirements checked.</strong>
                <span>Your agent’s boundaries and theirs come first.</span>
              </div>
            </div>
            <div className="meeting-plan">
              <span className="eyebrow">A LOW-PRESSURE FIRST HELLO</span>
              <h3>{match.plan.title}</h3>
              <p>{match.plan.detail}</p>
              <span className="plan-time">
                <Clock3 size={15} />
                {AVAILABILITY_LABELS[match.plan.availability]}
              </span>
            </div>
            <div className="dialog-section">
              <span className="eyebrow">A BEGINNING WORTH EXPLORING</span>
              <h3>{brief.idea.title}</h3>
              <p>{brief.idea.detail}</p>
              <ul>
                {brief.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <small>{brief.boundary}</small>
            </div>
          </>
        ) : (
          <>
            <div className="conversation-description">
              <FlowerMark />
              <p>
                {owner.agentName} and {match.person.agentName} compared requirements, interests, and
                availability. This is their structured demo conversation.
              </p>
            </div>
            <div className="message-timeline">
              {match.messages.map((message, index) => (
                <div
                  className={`agent-message ${index % 2 ? 'peer-message' : ''}`}
                  key={message.id}
                >
                  <div className="message-byline">
                    <span className="message-avatar">{message.from.slice(0, 1)}</span>
                    <strong>{message.from}</strong>
                    <span>{message.kind.replace('-', ' ')}</span>
                  </div>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {match.state === 'connected' ? (
          <div className="connection-status approved">
            <CheckCheck size={23} />
            <div>
              <h3>Two yeses. One good beginning.</h3>
              <p>
                You both approved this introduction. Your demo meeting plan is ready above. No real
                messages have been sent.
              </p>
            </div>
          </div>
        ) : match.state === 'awaiting-peer' ? (
          <div className="connection-status">
            <Clock3 size={22} />
            <div>
              <h3>Your yes is in.</h3>
              <p>Your introduction waits for {match.person.name}’s yes, too.</p>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => onAction('peer-approve')}
              >
                Simulate their approval <Check size={15} />
              </button>
              <small>Demo control: represent the fictional person’s approval.</small>
            </div>
          </div>
        ) : (
          <div className="consent-note">
            <HeartHandshake size={20} />
            <p>
              This is an invitation, never an obligation. Both people have to say yes before an
              introduction opens.
            </p>
          </div>
        )}
      </div>
      <div className="dialog-footer">
        {match.state === 'suggested' ? (
          <>
            <button className="text-button" disabled={busy} onClick={() => onAction('decline')}>
              Not this time
            </button>
            <button
              className="button button-primary"
              disabled={busy || owner.paused}
              onClick={() => onAction('approve')}
            >
              <Send size={16} />
              {busy ? 'One moment…' : 'Approve introduction'}
            </button>
          </>
        ) : (
          <button className="button button-secondary" onClick={onClose}>
            Back to connections <ArrowRight size={15} />
          </button>
        )}
        <button
          className="block-link"
          disabled={busy}
          onClick={() => setConfirmBlock(!confirmBlock)}
        >
          {confirmBlock ? 'Cancel block' : 'Block this person'}
        </button>
        {confirmBlock && (
          <div className="block-confirm">
            <p>Remove this person and prevent further introductions in this session?</p>
            <button
              className="button button-danger"
              disabled={busy}
              onClick={() => onAction('block')}
            >
              Yes, block person
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function AgentConnection({
  profile,
  onImport,
}: {
  profile: OwnerProfile;
  onImport: (profile: OwnerProfile) => Promise<void>;
}) {
  const [candidate, setCandidate] = useState<OwnerProfile | null>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [config, setConfig] = useState<{ config: object; expiresInHours: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const staticDemo = !LOCAL_INSTALL;
  async function connect() {
    setLoading(true);
    setError('');
    try {
      await localApi('/api/profile', 'PUT', profile);
      setConfig(
        await localApi<{ config: object; expiresInHours: number }>('/api/agent-connection', 'POST'),
      );
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect your agent.');
    } finally {
      setLoading(false);
    }
  }
  async function applyCandidate() {
    if (!candidate) return;
    setLoading(true);
    setError('');
    try {
      await onImport(candidate);
      setCandidate(null);
    } catch {
      setError('Could not apply these preferences. Keep your current profile and try again.');
    } finally {
      setLoading(false);
    }
  }
  async function review() {
    setLoading(true);
    setError('');
    try {
      const state = await localApi<SessionState>('/api/session');
      if (!state.profile) throw new Error('Pair your assistant first.');
      const normalized = validateProfile({ ...state.profile, id: profile.id });
      if (JSON.stringify(normalized) === JSON.stringify(validateProfile(profile))) {
        setReviewNotice('No assistant changes to review yet.');
        setCandidate(null);
      } else {
        setCandidate(normalized);
        setReviewNotice('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review assistant changes.');
    } finally {
      setLoading(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config?.config, null, 2));
      setCopied(true);
    } catch {
      setError('Clipboard is unavailable. Select and copy the configuration below.');
    }
  }
  return (
    <div className="agent-connection">
      <div>
        <Code2 size={21} />
        <h3>Bring your own agent.</h3>
        <button
          className="button button-secondary"
          onClick={connect}
          disabled={loading || staticDemo}
        >
          {loading ? 'Making a connection…' : config ? 'Refresh configuration' : 'Connect my agent'}
          <ArrowRight size={15} />
        </button>
      </div>
      <p>
        {staticDemo
          ? 'Run Kin locally to connect an existing agent.'
          : 'This button copies your profile to the Kin server on your computer and pairs your chosen assistant. That assistant can read the profile. It can update your preferences and explore matches. Every introduction still needs your approval here.'}
      </p>
      {!staticDemo && (
        <button className="text-button" onClick={review} disabled={loading}>
          Review assistant changes <ArrowRight size={15} />
        </button>
      )}
      {reviewNotice && <p role="status">{reviewNotice}</p>}
      {candidate && (
        <div className="assistant-review">
          <h4>Review before applying</h4>
          <p>
            These preferences replace your browser profile, reset suggestions, and pause active
            network negotiations until you rejoin.
          </p>
          <pre tabIndex={0} aria-label="Assistant profile changes">
            {JSON.stringify(candidate, null, 2)}
          </pre>
          <button className="button button-primary" onClick={applyCandidate} disabled={loading}>
            Use these preferences <Check size={15} />
          </button>
          <button className="text-button" onClick={() => setCandidate(null)}>
            Keep current preferences
          </button>
        </div>
      )}
      {error && (
        <p className="agent-connection-error" role="alert">
          {error}
        </p>
      )}
      {config && (
        <>
          <pre tabIndex={0} aria-label="Private agent connection configuration">
            {JSON.stringify(config.config, null, 2)}
          </pre>
          <div className="private-config-note">
            <ShieldCheck size={15} />
            Private local connection. Do not share this configuration.
          </div>
          <p className="config-expiry">
            This configuration expires in {config.expiresInHours} hours. It contains a private
            session capability.
          </p>
          <button className="text-button" onClick={copy}>
            {copied ? <Check size={15} /> : <Code2 size={15} />}{' '}
            {copied ? 'Copied configuration' : 'Copy configuration'}
          </button>
        </>
      )}
    </div>
  );
}
