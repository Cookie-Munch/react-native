/**
 * "Store this only with consent" for a native app — the React Native counterpart of
 * `consentCookie` in @cookiemunch/react. An app has no cookies, so the value goes to a
 * `MobileStorage` (AsyncStorage, or one of the secure-store adapters) instead: written
 * while `category` is granted, removed the moment it is not.
 *
 *   const stop = consentStoredValue(client, AsyncStorage, 'ab_bucket', 'statistics', () => pickBucket());
 */

import type { MobileStorage, MobileConsentState } from './client.js';
import type { ConsentSource, ConsentCategory } from './gate.js';

function granted(state: MobileConsentState, category: ConsentCategory): boolean {
  return category === 'necessary' ? true : state[category] === true;
}

/**
 * Keep `key` in `storage` in step with consent for `category`. `value` may be a function,
 * called only when the value is about to be written and is not already stored — so an id
 * is never generated without consent, and a stored one survives restarts.
 *
 * Applies the current decision at once (call it after `client.load()`), then follows every
 * change; until there is a decision nothing is written or removed. Storage writes run one at
 * a time, in order, so a quick grant-then-withdraw cannot finish as "granted". Returns a
 * function that stops following (what is stored is left as it is).
 */
export function consentStoredValue(
  source: ConsentSource,
  storage: MobileStorage,
  key: string,
  category: ConsentCategory,
  value: string | (() => string),
): () => void {
  let stopped = false;
  let queue: Promise<void> = Promise.resolve();
  let last: boolean | null = null;

  const apply = (state: MobileConsentState) => {
    if (stopped) return;
    const ok = granted(state, category);
    if (ok === last) return;
    last = ok;
    queue = queue
      .then(async () => {
        if (!ok) return storage.removeItem(key);
        if (typeof value !== 'function') return storage.setItem(key, value);
        if ((await storage.getItem(key)) === null) await storage.setItem(key, value());
      })
      .catch(() => {
        /* storage failure: the next change tries again */
        last = null;
      });
  };

  const unsub = source.onChange(apply);
  // The current state counts only once it is a decision. Before `client.load()` resolves,
  // getState() is the all-denied default, and acting on it would delete a value stored
  // under a grant the app simply has not read back yet.
  void Promise.resolve(source.getState()).then((s) => {
    if (s.method === 'explicit') apply(s);
  });

  return () => {
    stopped = true;
    unsub();
  };
}
