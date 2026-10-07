import { App } from '@modelcontextprotocol/ext-apps';

declare global {
  interface Window {
    __KIN_WIDGET__?: boolean;
    __KIN_RELAY__?: string;
    __KIN_HOST__?: App;
  }
}

// Only layout events cross the host bridge. Profiles, keys, negotiations, and chat never do.
export async function connectWidgetHost() {
  if (!window.__KIN_WIDGET__ || window.parent === window) return;
  const host = new App({ name: 'Kin', version: '0.1.0' }, {});
  await host.connect();
  window.__KIN_HOST__ = host;
}
