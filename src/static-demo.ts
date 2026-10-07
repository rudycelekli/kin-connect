import { demoProfile, discover, transitionMatch, validateProfile } from './matchmaking';
import type { Intent, SessionState } from './shared/types';

const KEY = 'kin-local-demo-v1';
const empty = (): SessionState => ({
  profile: null,
  matches: [],
  demo: true,
  searchedAt: null,
  blockedPersonIds: [],
});
function load(): SessionState {
  const saved = localStorage.getItem(KEY);
  if (!saved) return empty();
  try {
    const state = JSON.parse(saved) as SessionState;
    if (state.profile) validateProfile(state.profile);
    if (!Array.isArray(state.matches)) throw new Error();
    return state;
  } catch {
    localStorage.removeItem(KEY);
    return empty();
  }
}
function save(state: SessionState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}
/** Public Pages demo runs entirely in the visitor's browser. No remote profile API. */
export async function staticApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const state = load();
  if (path === '/api/session' && method === 'GET') return state as T;
  if (path === '/api/export' && method === 'GET') return state as T;
  if (path === '/api/session' && method === 'DELETE') {
    localStorage.removeItem(KEY);
    return { ok: true } as T;
  }
  if (path === '/api/agent-connection')
    throw new Error(
      'Run Kin locally to connect an existing agent. The public demo stays in your browser.',
    );
  if (path === '/api/demo' && method === 'POST') {
    const profile = { ...demoProfile(), id: crypto.randomUUID() };
    return save({
      ...empty(),
      profile,
      matches: discover(profile, 'friendship').matches,
      searchedAt: new Date().toISOString(),
    }) as T;
  }
  if (path === '/api/profile' && method === 'PUT') {
    let profile;
    try {
      profile = validateProfile({
        ...(body as Record<string, unknown>),
        id: state.profile?.id ?? crypto.randomUUID(),
      });
    } catch (error) {
      throw new Error(
        (error as { issues?: Array<{ message: string }> }).issues?.[0]?.message ??
          'Check your profile and try again.',
      );
    }
    return save({ ...state, profile, matches: [], searchedAt: null }) as T;
  }
  if (path === '/api/discover' && method === 'POST') {
    if (!state.profile) throw new Error('Meet your agent first.');
    if (state.profile.paused) throw new Error('Your agent is paused. Resume to find connections.');
    const intent = (body as { intent: Intent })?.intent;
    if (!state.profile.intents.includes(intent))
      throw new Error('Add this connection type to your preferences first.');
    const found = discover(state.profile, intent);
    const existing = new Map(state.matches.map((m) => [m.id, m]));
    const blocked = new Set(state.blockedPersonIds ?? []);
    const matches = found.matches
      .map((m) => existing.get(m.id) ?? m)
      .filter((m) => !blocked.has(m.person.id) && !['blocked', 'declined'].includes(m.state));
    const other = state.matches.filter(
      (m) => m.intent !== intent || ['blocked', 'declined'].includes(m.state),
    );
    save({ ...state, matches: [...matches, ...other], searchedAt: new Date().toISOString() });
    return { ...found, matches } as T;
  }
  const actionPath = path.match(/^\/api\/matches\/([^/]+)\/actions$/);
  if (actionPath && method === 'POST') {
    const action = (body as { action: 'approve' | 'peer-approve' | 'decline' | 'block' })?.action;
    if (!state.profile || (state.profile.paused && ['approve', 'peer-approve'].includes(action)))
      throw new Error('Resume your agent before approving introductions.');
    const index = state.matches.findIndex((m) => m.id === decodeURIComponent(actionPath[1]));
    if (index < 0) throw new Error('Introduction not found.');
    if (
      (state.blockedPersonIds ?? []).includes(state.matches[index].person.id) &&
      ['approve', 'peer-approve'].includes(action)
    )
      throw new Error('This person is blocked.');
    const updated = transitionMatch(state.matches[index], action);
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
    save({ ...state, matches, blockedPersonIds });
    return updated as T;
  }
  throw new Error('This action is unavailable in the public demo.');
}
