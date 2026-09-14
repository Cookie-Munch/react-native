/**
 * React Native consent client — framework-agnostic core (no react-native imports,
 * so it's fully unit-testable). Persists consent to an injected Storage
 * (AsyncStorage in an app) and syncs to the Cookie Munch REST API. API failures are
 * swallowed: a consent decision is NEVER lost just because the device is offline.
 */

export type MobileConsentMethod = 'explicit' | 'implied';

export interface MobileChoices {
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
}

export interface MobileConsentState extends MobileChoices {
  necessary: true;
  method: MobileConsentMethod;
  stamp: string;
  ver: number;
  utc: number;
  region: string;
}

/** AsyncStorage-compatible. */
export interface MobileStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ConsentClientOptions {
  cbid: string;
  apiUrl: string;
  storage: MobileStorage;
  fetch?: typeof fetch;
  now?: () => number;
  stamp?: () => string;
  region?: string;
  storageKey?: string;
  /**
   * Optional, app-supplied STABLE cross-surface subject id (e.g. a logged-in account id).
   * When set, it is included with every synced decision so an org can correlate one subject's
   * consent across web + mobile + desktop. Sent only when present; omitted → the sync body is
   * byte-identical to before this field existed.
   */
  subjectId?: string;
}

export interface ConsentClient {
  load(): Promise<MobileConsentState>;
  accept(): Promise<MobileConsentState>;
  decline(): Promise<MobileConsentState>;
  submitCustom(choices: MobileChoices): Promise<MobileConsentState>;
  getState(): MobileConsentState;
  hasResponse(): boolean;
  onChange(cb: (state: MobileConsentState) => void): () => void;
}

function randomStamp(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createConsentClient(opts: ConsentClientOptions): ConsentClient {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const region = opts.region ?? 'unknown';
  const key = opts.storageKey ?? 'CookieMunch';
  const listeners = new Set<(s: MobileConsentState) => void>();

  let state: MobileConsentState = {
    necessary: true,
    preferences: false,
    statistics: false,
    marketing: false,
    method: 'implied',
    stamp: opts.stamp?.() ?? randomStamp(),
    ver: 1,
    utc: now(),
    region,
  };

  function emit(): void {
    for (const cb of Array.from(listeners)) {
      try { cb(state); } catch { /* listener errors never break consent */ }
    }
  }

  async function persist(): Promise<void> {
    await opts.storage.setItem(key, JSON.stringify(state));
  }

  async function sync(): Promise<void> {
    try {
      await doFetch(`${opts.apiUrl}/api/v1/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CookieMunch-Region': region },
        body: JSON.stringify({
          cbid: opts.cbid,
          stamp: state.stamp,
          choices: { preferences: state.preferences, statistics: state.statistics, marketing: state.marketing },
          method: state.method,
          ver: state.ver,
          utc: state.utc,
          url: `app://${opts.cbid}`,
          ...(opts.subjectId ? { subjectId: opts.subjectId } : {}),
        }),
      });
    } catch {
      // offline — the local persist already captured the decision; retry later.
    }
  }

  async function commit(choices: MobileChoices): Promise<MobileConsentState> {
    state = { ...state, ...choices, necessary: true, method: 'explicit', utc: now() };
    await persist();
    emit();
    await sync();
    return state;
  }

  return {
    async load() {
      const raw = await opts.storage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<MobileConsentState>;
          state = {
            necessary: true,
            preferences: !!parsed.preferences,
            statistics: !!parsed.statistics,
            marketing: !!parsed.marketing,
            method: parsed.method === 'explicit' ? 'explicit' : 'implied',
            stamp: typeof parsed.stamp === 'string' ? parsed.stamp : state.stamp,
            ver: typeof parsed.ver === 'number' ? parsed.ver : 1,
            utc: typeof parsed.utc === 'number' ? parsed.utc : now(),
            region: typeof parsed.region === 'string' ? parsed.region : region,
          };
        } catch { /* corrupt — keep default */ }
      }
      return state;
    },
    accept() { return commit({ preferences: true, statistics: true, marketing: true }); },
    decline() { return commit({ preferences: false, statistics: false, marketing: false }); },
    submitCustom(choices) { return commit(choices); },
    getState() { return state; },
    hasResponse() { return state.method === 'explicit'; },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}
