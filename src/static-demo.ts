import {
  demoProfile,
  discover,
  refreshSuggestion,
  transitionMatch,
  validateProfile,
} from './matchmaking';
import type { Intent, SessionState } from './shared/types';
import {
  applyToCircle,
  circleFingerprint,
  profileFingerprint,
  transitionCircleApplication,
  validateCircleApplication,
} from './communities';
import { circleCatalog } from './communities/infrastructure';
import { validateSavedConnection } from './saved-connections';

const KEY = 'kin-local-demo-v1';
const empty = (): SessionState => ({
  profile: null,
  matches: [],
  demo: true,
  searchedAt: null,
  blockedPersonIds: [],
  circleApplications: [],
  savedConnections: [],
});
function load(): SessionState {
  const saved = localStorage.getItem(KEY);
  if (!saved) return empty();
  try {
    const state = JSON.parse(saved) as SessionState;
    if (state.profile) validateProfile(state.profile);
    if (!Array.isArray(state.matches)) throw new Error();
    // Demo applications never outlive the profile and host policy reviewed for them.
    const circleApplications = (
      Array.isArray(state.circleApplications) ? state.circleApplications : []
    ).flatMap((input) => {
      try {
        const application = validateCircleApplication(input);
        const circle = circleCatalog.find((item) => item.id === application.circleId);
        if (
          !state.profile ||
          !circle ||
          application.profileFingerprint !== profileFingerprint(state.profile) ||
          application.circleFingerprint !== circleFingerprint(circle)
        )
          return [];
        return [application];
      } catch {
        return [];
      }
    });
    const savedConnections = (Array.isArray(state.savedConnections) ? state.savedConnections : [])
      .slice(0, 200)
      .flatMap((input) => {
        try {
          return [validateSavedConnection(input)];
        } catch {
          return [];
        }
      });
    return { ...state, circleApplications, savedConnections };
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
    return save({ ...state, profile, matches: [], searchedAt: null, circleApplications: [] }) as T;
  }
  if (path === '/api/saved-connections' && method === 'POST') {
    if (!state.profile) throw new Error('Meet your agent first.');
    const connection = validateSavedConnection({
      ...(body as Record<string, unknown>),
      savedAt: new Date().toISOString(),
    });
    const existing = state.savedConnections ?? [];
    if (existing.length >= 200 && !existing.some((item) => item.peerId === connection.peerId))
      throw new Error('This private circle can hold up to 200 saved connections.');
    return save({
      ...state,
      savedConnections: [
        ...existing.filter((item) => item.peerId !== connection.peerId),
        connection,
      ],
    }) as T;
  }
  const savedConnectionPath = path.match(/^\/api\/saved-connections\/([a-f0-9]{64})$/);
  if (savedConnectionPath && method === 'DELETE')
    return save({
      ...state,
      savedConnections: (state.savedConnections ?? []).filter(
        (item) => item.peerId !== savedConnectionPath[1],
      ),
    }) as T;
  const circlePath = path.match(/^\/api\/circles\/([^/]+)\/applications$/);
  if (circlePath && method === 'POST') {
    if (!state.profile) throw new Error('Meet your agent before applying to a circle.');
    const circle = circleCatalog.find((item) => item.id === decodeURIComponent(circlePath[1]));
    if (!circle) throw new Error('Circle not found.');
    const existing = state.circleApplications ?? [];
    if (
      existing.some(
        (item) =>
          item.circleId === circle.id && ['pending-organizer', 'member'].includes(item.state),
      )
    )
      throw new Error('You already have an active application for this circle.');
    const application = applyToCircle(state.profile, circle);
    return save({
      ...state,
      circleApplications: [...existing.filter((item) => item.circleId !== circle.id), application],
    }) as T;
  }
  const circleActionPath = path.match(/^\/api\/circle-applications\/([^/]+)\/actions$/);
  if (circleActionPath && method === 'POST') {
    if (!state.profile) throw new Error('Meet your agent first.');
    const existing = state.circleApplications ?? [];
    const application = existing.find(
      (item) => item.id === decodeURIComponent(circleActionPath[1]),
    );
    if (!application) throw new Error('Circle application not found.');
    const circle = circleCatalog.find((item) => item.id === application.circleId);
    if (!circle) throw new Error('Circle not found.');
    const updated = transitionCircleApplication(
      state.profile,
      circle,
      application,
      (body as { action: Parameters<typeof transitionCircleApplication>[3] })?.action,
    );
    return save({
      ...state,
      circleApplications: existing.map((item) => (item.id === updated.id ? updated : item)),
    }) as T;
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
      .map((m) => refreshSuggestion(existing.get(m.id), m))
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
