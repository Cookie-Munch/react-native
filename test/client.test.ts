import { describe, it, expect, vi } from 'vitest';
import { createConsentClient, type MobileStorage } from '../src/client.js';

function memStorage(): MobileStorage {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

function setup(fetchImpl?: typeof fetch) {
  const storage = memStorage();
  const fetchMock = vi.fn(fetchImpl ?? (async () => ({ ok: true, status: 204 }) as Response));
  const client = createConsentClient({
    cbid: 'demo',
    apiUrl: 'https://api.test',
    storage,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => 1000,
    stamp: () => 'm-stamp',
    region: 'gb',
  });
  return { client, storage, fetchMock };
}

describe('load', () => {
  it('returns an implied default when nothing is stored', async () => {
    const { client } = setup();
    const s = await client.load();
    expect(s.necessary).toBe(true);
    expect(s.marketing).toBe(false);
    expect(s.method).toBe('implied');
    expect(client.hasResponse()).toBe(false);
  });

  it('restores a previously persisted choice', async () => {
    const { client, storage } = setup();
    await client.load();
    await client.accept();
    const { client: client2 } = { client: createClientWith(storage) };
    const restored = await client2.load();
    expect(restored.marketing).toBe(true);
    expect(client2.hasResponse()).toBe(true);
  });
});

function createClientWith(storage: MobileStorage) {
  return createConsentClient({ cbid: 'demo', apiUrl: 'https://api.test', storage, fetch: (async () => ({ ok: true }) as Response) as unknown as typeof fetch, now: () => 2000, stamp: () => 'x', region: 'gb' });
}

describe('accept / decline / submitCustom', () => {
  it('accept grants all, persists, and POSTs to the API', async () => {
    const { client, storage, fetchMock } = setup();
    await client.load();
    const s = await client.accept();
    expect(s.marketing).toBe(true);
    expect(s.method).toBe('explicit');
    expect(await storage.getItem('CookieMunch')).toContain('"marketing":true');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/api/v1/consent');
    expect((init as RequestInit).method).toBe('POST');
    expect(String((init as RequestInit).body)).toContain('"cbid":"demo"');
  });

  it('decline denies all non-necessary', async () => {
    const { client } = setup();
    await client.load();
    const s = await client.decline();
    expect(s.marketing).toBe(false);
    expect(s.statistics).toBe(false);
    expect(client.hasResponse()).toBe(true);
  });

  it('submitCustom records the exact choices', async () => {
    const { client } = setup();
    await client.load();
    const s = await client.submitCustom({ preferences: true, statistics: false, marketing: true });
    expect(s.preferences).toBe(true);
    expect(s.statistics).toBe(false);
    expect(s.marketing).toBe(true);
  });
});

describe('subjectId', () => {
  it('omits subjectId from the sync body when not configured', async () => {
    const { client, fetchMock } = setup();
    await client.load();
    await client.accept();
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body).not.toHaveProperty('subjectId');
  });

  it('includes a configured subjectId in the sync body', async () => {
    const storage = memStorage();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response);
    const client = createConsentClient({
      cbid: 'demo',
      apiUrl: 'https://api.test',
      storage,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => 1000,
      stamp: () => 'm-stamp',
      region: 'gb',
      subjectId: 'user-42',
    });
    await client.load();
    await client.accept();
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.subjectId).toBe('user-42');
  });
});

describe('offline resilience', () => {
  it('persists consent locally even when the API POST fails', async () => {
    const { client, storage } = setup(async () => { throw new Error('offline'); });
    await client.load();
    const s = await client.accept(); // must not throw
    expect(s.marketing).toBe(true);
    expect(await storage.getItem('CookieMunch')).toContain('"marketing":true');
  });
});

describe('onChange', () => {
  it('notifies subscribers on each decision and can unsubscribe', async () => {
    const { client } = setup();
    await client.load();
    const cb = vi.fn();
    const off = client.onChange(cb);
    await client.accept();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await client.decline();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
