import { parseIntakeConfig } from './intake-assistant.js';
export type IntakeProvider = 'openai' | 'anthropic';
export type IntakeSettings = Partial<Record<IntakeProvider, { apiKey: string; model: string }>>;

/** Public relays never process private owner text or consume provider keys. */
export function loadIntakeSettings(
  env: Record<string, string | undefined>,
  publicMode: boolean,
): IntakeSettings | undefined {
  if (publicMode || env.KIN_INTAKE_ENABLED !== 'true') return undefined;
  const settings: IntakeSettings = {};
  for (const [provider, keyName, modelName] of [
    ['openai', 'OPENAI_API_KEY', 'KIN_OPENAI_INTAKE_MODEL'],
    ['anthropic', 'ANTHROPIC_API_KEY', 'KIN_ANTHROPIC_INTAKE_MODEL'],
  ] as const) {
    const apiKey = env[keyName],
      model = env[modelName];
    if (!apiKey && !model) continue;
    if (!apiKey || !model) throw new Error('Enabled intake requires a provider key and model.');
    try {
      settings[provider] = parseIntakeConfig({ apiKey, model });
    } catch {
      throw new Error('Invalid intake provider configuration.');
    }
  }
  if (!Object.keys(settings).length)
    throw new Error('Enable at least one intake provider explicitly.');
  return settings;
}

/** Attempt cap per running local server, not a durable dollar budget. */
export class IntakeRequestBudget {
  private startedAt: number | undefined;
  private attempts = 0;
  private active = false;
  constructor(private now: () => number = Date.now) {}
  acquire(): (() => void) | undefined {
    const current = this.now();
    if (!Number.isFinite(current) || current < 0 || this.active) return undefined;
    if (this.startedAt === undefined || current - this.startedAt >= 3_600_000) {
      this.startedAt = current;
      this.attempts = 0;
    }
    if (this.attempts >= 10) return undefined;
    this.attempts++;
    this.active = true;
    let released = false;
    return () => {
      if (!released) {
        this.active = false;
        released = true;
      }
    };
  }
}
