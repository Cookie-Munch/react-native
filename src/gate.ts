/**
 * Consent gating — the native equivalent of the web embed's prior-blocking. A mobile app
 * can't rewrite <script> tags, so instead you defer initializing an SDK until the
 * relevant consent category is granted:
 *
 *   const gate = createConsentGate(client);
 *   gate.gate('statistics', () => initAnalytics());
 *
 * `initAnalytics` runs the moment consent for `statistics` is (or becomes) granted, and
 * never before — and never twice. This mirrors @cookiemunch/electron's gate exactly so
 * the desktop and mobile SDKs feel identical.
 */

import type { MobileConsentState } from './client.js';

/** Any addressable consent category, including the always-on `necessary`. */
export type ConsentCategory = 'necessary' | 'preferences' | 'statistics' | 'marketing';

/**
 * Anything that exposes the current state and change notifications — the `ConsentClient`
 * satisfies this structurally, but so does any custom source.
 */
export interface ConsentSource {
  getState(): MobileConsentState | Promise<MobileConsentState>;
  onChange(cb: (state: MobileConsentState) => void): () => void;
}

function granted(state: MobileConsentState, category: ConsentCategory): boolean {
  return category === 'necessary' ? true : state[category];
}

export interface ConsentGate {
  /** True iff the current state grants `category`. */
  isConsented(category: ConsentCategory): Promise<boolean>;
  /**
   * Run `fn` exactly once, as soon as `category` is granted — immediately if it already
   * is, otherwise on the first change that grants it. Returns an unsubscribe function
   * that cancels a still-pending gate.
   */
  whenConsented(category: ConsentCategory, fn: () => void): () => void;
  /**
   * Alias of {@link whenConsented} that reads as "gate this SDK behind consent":
   *   gate.gate('marketing', () => initMetaPixel());
   */
  gate(category: ConsentCategory, fn: () => void): () => void;
}

/** Build a {@link ConsentGate} over any {@link ConsentSource} (e.g. a `ConsentClient`). */
export function createConsentGate(source: ConsentSource): ConsentGate {
  const whenConsented: ConsentGate['whenConsented'] = (category, fn) => {
    let done = false;
    let unsub: (() => void) | null = null;

    const fire = () => {
      if (done) return;
      done = true;
      if (unsub) unsub();
      fn();
    };

    // Subscribe first so we never miss a change that lands between the read and the
    // subscription.
    unsub = source.onChange((state) => {
      if (granted(state, category)) fire();
    });

    Promise.resolve(source.getState()).then((state) => {
      if (granted(state, category)) fire();
    });

    return () => {
      done = true;
      if (unsub) unsub();
    };
  };

  return {
    async isConsented(category) {
      return granted(await source.getState(), category);
    },
    whenConsented,
    gate: whenConsented,
  };
}
