import { describe, it, expect, vi } from 'vitest';
import { createConsentClient, type MobileStorage, type MobileConsentState } from '../src/client.js';
import { createConsentGate, type ConsentSource } from '../src/gate.js';

function memStorage(): MobileStorage {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

function newClient() {
  return createConsentClient({
    cbid: 'demo',
    apiUrl: 'https://api.test',
    storage: memStorage(),
    fetch: (async () => ({ ok: true, status: 204 }) as Response) as unknown as typeof fetch,
    now: () => 1000,
    stamp: () => 'm-stamp',
    region: 'gb',
  });
}

describe('gate over a ConsentClient', () => {
  it('does NOT run before consent, and runs once consent is granted', async () => {
    const client = newClient();
    await client.load();
    const gate = createConsentGate(client);
    const init = vi.fn();

    gate.gate('statistics', init);
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled(); // implied default: not consented

    await client.decline();
    expect(init).not.toHaveBeenCalled(); // still not consented

    await client.accept();
    expect(init).toHaveBeenCalledTimes(1); // now granted -> runs
  });

  it('runs immediately when consent is already granted', async () => {
    const client = newClient();
    await client.load();
    await client.accept();

    const gate = createConsentGate(client);
    const init = vi.fn();
    gate.whenConsented('marketing', init);
    await Promise.resolve(); // getState is read via a resolved promise
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('runs at most once even across multiple grants', async () => {
    const client = newClient();
    await client.load();
    const gate = createConsentGate(client);
    const init = vi.fn();
    gate.gate('preferences', init);

    await client.accept();
    await client.submitCustom({ preferences: true, statistics: true, marketing: true });
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled before consent is granted', async () => {
    const client = newClient();
    await client.load();
    const gate = createConsentGate(client);
    const init = vi.fn();
    const cancel = gate.gate('statistics', init);
    cancel();
    await client.accept();
    expect(init).not.toHaveBeenCalled();
  });

  it('treats `necessary` as always granted', async () => {
    const client = newClient();
    await client.load();
    const gate = createConsentGate(client);
    const init = vi.fn();
    gate.gate('necessary', init);
    await Promise.resolve();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('isConsented reflects the current state', async () => {
    const client = newClient();
    await client.load();
    const gate = createConsentGate(client);
    expect(await gate.isConsented('statistics')).toBe(false);
    await client.accept();
    expect(await gate.isConsented('statistics')).toBe(true);
  });
});

describe('createConsentGate over an arbitrary async source', () => {
  it('fires on the first change that grants the category', async () => {
    let state: MobileConsentState = {
      necessary: true,
      preferences: false,
      statistics: false,
      marketing: false,
      method: 'implied',
      stamp: 'x',
      ver: 1,
      utc: 0,
      region: 'gb',
    };
    const listeners = new Set<(s: MobileConsentState) => void>();
    const source: ConsentSource = {
      getState: async () => state,
      onChange: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    const gate = createConsentGate(source);

    const init = vi.fn();
    gate.gate('marketing', init);
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();

    state = { ...state, marketing: true };
    for (const cb of listeners) cb(state);
    expect(init).toHaveBeenCalledTimes(1);
    // Subscription is torn down after firing.
    expect(listeners.size).toBe(0);
  });
});
