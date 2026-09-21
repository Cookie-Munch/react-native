/**
 * "Do I have to ask this person at all?" — the first question a mobile app has, and
 * the one the RN client could not answer. Parity with the iOS and Android SDKs, and
 * with the same jurisdiction table, imported rather than re-typed.
 */
import { describe, it, expect, vi } from 'vitest';
import { createConsentClient, type MobileStorage } from '../src/client.js';

function memoryStorage(): MobileStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => { map.set(k, v); },
    removeItem: async (k) => { map.delete(k); },
  };
}

function client(region: string, fetchImpl?: typeof fetch) {
  return createConsentClient({
    cbid: 'cb-1',
    apiUrl: 'https://cmp.example.com',
    storage: memoryStorage(),
    region,
    now: () => 1700000000000,
    stamp: () => 'fixed',
    ...(fetchImpl ? { fetch: fetchImpl } : { fetch: vi.fn(async () => new Response('', { status: 204 })) as unknown as typeof fetch }),
  });
}

function configFetch(body: unknown): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('/config/')) {
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('', { status: 204 });
  }) as unknown as typeof fetch;
}

describe('applicableRegulation', () => {
  it('resolves offline from the configured region', () => {
    expect(client('de').applicableRegulation().regulations.gdprApplies).toBe(true);
    expect(client('us-ca').applicableRegulation().regulations.ccpaApplies).toBe(true);
    expect(client('br').applicableRegulation().regulations.lgpdApplies).toBe(true);
  });

  it('an unknown region falls back to opt-in — the safe direction to be wrong in', () => {
    const reg = client('unknown').applicableRegulation();
    expect(reg.model).toBe('opt-in');
    expect(reg.defaultState).toBe('denied');
  });
});

describe('isConsentRequired', () => {
  it('is true before they answer and false after', async () => {
    const c = client('de');
    expect(c.isConsentRequired()).toBe(true);
    await c.accept();
    expect(c.isConsentRequired()).toBe(false);
  });

  it('declining still counts as answering — do not re-prompt someone who said no', async () => {
    const c = client('de');
    await c.decline();
    expect(c.isConsentRequired()).toBe(false);
  });

  it('a GPC signal answers for them under an opt-out regime', () => {
    const c = client('us-ca');
    expect(c.isConsentRequired()).toBe(true);
    c.setGlobalPrivacyControl(true);
    expect(c.isConsentRequired()).toBe(false);
    expect(c.applicableRegulation().forcedOptOut).toBe(true);
  });

  it('a GPC signal does not suppress a GDPR prompt — nothing fires before consent anyway', () => {
    const c = client('de');
    c.setGlobalPrivacyControl(true);
    expect(c.isConsentRequired()).toBe(true);
  });

  it('Do Not Track behaves like GPC', () => {
    const c = client('us-tx');
    c.setDoNotTrack(true);
    expect(c.isConsentRequired()).toBe(false);
  });
});

describe('refreshRegulation', () => {
  it('adopts the server answer over the local guess', async () => {
    // A German-locale phone, physically in California. The server sees the IP.
    const c = client('de', configFetch({
      regulation: {
        region: 'us-ca', class: 'us',
        regulations: { gdprApplies: false, ccpaApplies: true, lgpdApplies: false },
        model: 'opt-out', defaultState: 'granted', framework: 'gpp',
        forcedOptOut: false, consentRequired: true,
      },
    }));
    expect(c.applicableRegulation().regulations.gdprApplies).toBe(true);
    await c.refreshRegulation();
    expect(c.applicableRegulation().regulations.ccpaApplies).toBe(true);
    expect(c.applicableRegulation().model).toBe('opt-out');
  });

  it('sends the region header to /config/:cbid', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const c = client('fr', spy as unknown as typeof fetch);
    await c.refreshRegulation();
    const [url, init] = spy.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://cmp.example.com/config/cb-1');
    expect((init.headers as Record<string, string>)['X-CookieMunch-Region']).toBe('fr');
  });

  it('keeps the local regime when the server is unreachable', async () => {
    const c = client('de', (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    await c.refreshRegulation();
    expect(c.applicableRegulation().regulations.gdprApplies).toBe(true);
    expect(c.isConsentRequired()).toBe(true);
  });

  it('keeps the local regime against a server too old to send one', async () => {
    const c = client('de', configFetch({ cbid: 'cb-1', region: 'de' }));
    await c.refreshRegulation();
    expect(c.applicableRegulation().regulations.gdprApplies).toBe(true);
  });
});
