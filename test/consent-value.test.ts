import { describe, it, expect } from 'vitest';
import { createConsentClient, type MobileStorage } from '../src/client.js';
import { consentStoredValue } from '../src/consent-value.js';

function memStorage(seed: Record<string, string> = {}): MobileStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

function newClient(storage: MobileStorage = memStorage()) {
  return createConsentClient({
    cbid: 'demo',
    apiUrl: 'https://api.test',
    storage,
    fetch: (async () => ({ ok: true, status: 204 }) as Response) as unknown as typeof fetch,
    now: () => 1000,
    stamp: () => 'm-stamp',
    region: 'gb',
  });
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('consentStoredValue', () => {
  it('writes on grant, removes on decline', async () => {
    const client = newClient();
    await client.load();
    const app = memStorage();
    const stop = consentStoredValue(client, app, 'ab', 'statistics', 'B');
    await settle();
    expect(app.map.has('ab')).toBe(false);
    await client.submitCustom({ preferences: false, statistics: true, marketing: false });
    await settle();
    expect(app.map.get('ab')).toBe('B');
    await client.decline();
    await settle();
    expect(app.map.has('ab')).toBe(false);
    stop();
  });

  it('before a decision is loaded, leaves a stored value alone', async () => {
    const client = newClient();
    const app = memStorage({ ab: 'A' });
    const stop = consentStoredValue(client, app, 'ab', 'statistics', 'B');
    await settle();
    expect(app.map.get('ab')).toBe('A');
    stop();
  });

  it('applies a loaded decision at once, and keeps a stored lazy value', async () => {
    const consentStore = memStorage();
    const first = newClient(consentStore);
    await first.load();
    await first.accept();
    // Next app start.
    const client = newClient(consentStore);
    await client.load();
    let calls = 0;
    const app = memStorage({ uid: 'kept' });
    const stop = consentStoredValue(client, app, 'uid', 'statistics', () => `new-${++calls}`);
    await settle();
    expect(app.map.get('uid')).toBe('kept');
    expect(calls).toBe(0);
    stop();
  });

  it('a lazy value is generated only with consent', async () => {
    const client = newClient();
    await client.load();
    let calls = 0;
    const app = memStorage();
    const stop = consentStoredValue(client, app, 'uid', 'marketing', () => `id-${++calls}`);
    await client.decline();
    await settle();
    expect(calls).toBe(0);
    await client.accept();
    await settle();
    expect(app.map.get('uid')).toBe('id-1');
    stop();
  });

  it('grant then immediate decline ends removed (writes are ordered)', async () => {
    const client = newClient();
    await client.load();
    const app = memStorage();
    const stop = consentStoredValue(client, app, 'ab', 'statistics', 'B');
    void client.accept();
    void client.decline();
    await settle();
    await settle();
    expect(app.map.has('ab')).toBe(false);
    stop();
  });
});
