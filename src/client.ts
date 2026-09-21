/**
 * React Native consent client — framework-agnostic core (no react-native imports,
 * so it's fully unit-testable). Persists consent to an injected Storage
 * (AsyncStorage in an app) and syncs to the Cookie Munch REST API. API failures are
 * swallowed: a consent decision is NEVER lost just because the device is offline.
 */

import { resolveRegulation, type Regulation } from '@cookiemunch/geo/regulation';

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
  /**
   * Which privacy regime applies: GDPR / CCPA / LGPD, opt-in vs opt-out, and which
   * signalling framework applies. Answers immediately and offline from the configured
   * `region`; call `refreshRegulation()` to replace that with the server's IP-derived
   * answer — a device's locale says where the phone was sold, not where its owner is.
   */
  applicableRegulation(): Regulation;
  /**
   * Whether you still owe this person a prompt. False once they have answered, and
   * false when an opt-out signal has already answered for them. Check this before
   * showing a banner rather than showing one unconditionally.
   */
  isConsentRequired(): boolean;
  /** Record a Global Privacy Control signal (a refusal, under an opt-out regime). */
  setGlobalPrivacyControl(enabled: boolean): void;
  /** Record a legacy Do Not Track signal. Treated exactly like GPC. */
  setDoNotTrack(enabled: boolean): void;
  /**
   * Ask the server which regime applies for the IP it sees, and adopt the answer.
   * Never rejects: offline, or against a server too old to send one, the locally
   * resolved regime stays in place.
   */
  refreshRegulation(): Promise<Regulation>;
  /**
   * Attach this device's decisions to a logged-in account, so one person's consent can
   * be correlated across web, mobile and desktop (`GET /v1/subjects/:id/consent`).
   *
   * Call it after login rather than relying on the constructor option: an app builds its
   * consent client at startup, before anyone has logged in. Pass `undefined` on logout —
   * continuing to send the id would attribute the next person's decisions on a shared
   * device to the account that just left.
   *
   * The id is opaque to us: stored and bound into the hash chain, never interpreted.
   */
  setSubjectId(subjectId: string | undefined): void;
  /** The account id currently attached, if any. */
  getSubjectId(): string | undefined;
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

  // Who this device's decisions belong to, if the app has told us. Deliberately NOT
  // persisted with the decision: who is logged in is the app's business and can change
  // between launches, so baking a stale account id into a restored record would
  // attribute one person's consent to another.
  let subjectId: string | undefined = opts.subjectId || undefined;

  // Set once the server has told us the regime for this person's real location.
  let serverRegulation: Regulation | undefined;
  let gpc = false;
  let dnt = false;

  function resolveLocal(): Regulation {
    return serverRegulation ?? resolveRegulation({ region, gpc, dnt });
  }

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
          ...(subjectId ? { subjectId } : {}),
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

    setSubjectId(next) { subjectId = next || undefined; },
    getSubjectId() { return subjectId; },

    applicableRegulation() { return resolveLocal(); },
    isConsentRequired() {
      return state.method !== 'explicit' && resolveLocal().consentRequired;
    },
    setGlobalPrivacyControl(enabled) {
      gpc = enabled;
      serverRegulation = undefined; // the local resolver now has newer information
    },
    setDoNotTrack(enabled) {
      dnt = enabled;
      serverRegulation = undefined;
    },
    async refreshRegulation() {
      try {
        const res = await doFetch(`${opts.apiUrl}/config/${encodeURIComponent(opts.cbid)}`, {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-CookieMunch-Region': region },
        });
        if (res.ok) {
          const body = (await res.json()) as { regulation?: Regulation };
          if (body.regulation) serverRegulation = body.regulation;
        }
      } catch {
        // offline, or a server too old to answer — keep the local regime. A failed
        // refresh must never leave the app with no answer to "do I prompt".
      }
      return resolveLocal();
    },
  };
}
