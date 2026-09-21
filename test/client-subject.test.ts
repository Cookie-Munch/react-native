/**
 * Linking a consent decision to a logged-in account.
 *
 * The server has always supported this — `subjectId` on the consent ingest is validated,
 * stored and bound into the hash chain, and `GET /v1/subjects/:id/consent` reads a
 * subject's consent back across every site and surface. Only this client ever sent it,
 * and only as a constructor argument.
 *
 * Constructor-only is close to useless for the case it exists for: an app builds its
 * consent client at startup, before anyone has logged in, and learns the account id
 * afterwards. By then the client is constructed and the id can never be attached.
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

function setup(subjectId?: string) {
  const calls: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response('', { status: 204 });
  });
  const client = createConsentClient({
    cbid: 'cb-1',
    apiUrl: 'https://cmp.example.com',
    storage: memoryStorage(),
    region: 'de',
    now: () => 1700000000000,
    stamp: () => 'fixed',
    fetch: fetchImpl as unknown as typeof fetch,
    ...(subjectId ? { subjectId } : {}),
  });
  return { client, calls };
}

describe('setSubjectId', () => {
  it('attaches the account id to decisions made after login', async () => {
    const { client, calls } = setup();
    await client.accept();
    expect(calls[0]!.subjectId).toBeUndefined();

    client.setSubjectId('account-42');
    await client.decline();
    expect(calls[1]!.subjectId).toBe('account-42');
  });

  it('overrides one supplied at construction', async () => {
    const { client, calls } = setup('from-constructor');
    client.setSubjectId('after-login');
    await client.accept();
    expect(calls[0]!.subjectId).toBe('after-login');
  });

  /**
   * Logging out must detach the id. Continuing to send it would attribute the next
   * person's decisions on a shared device to the account that just left.
   */
  it('clearing it stops the id being sent', async () => {
    const { client, calls } = setup('account-42');
    client.setSubjectId(undefined);
    await client.accept();
    expect('subjectId' in calls[0]!).toBe(false);
  });

  it('an empty string clears it rather than sending an empty id', async () => {
    const { client, calls } = setup('account-42');
    client.setSubjectId('');
    await client.accept();
    expect('subjectId' in calls[0]!).toBe(false);
  });

  it('is readable back, so an app can check what it is attached to', () => {
    const { client } = setup();
    expect(client.getSubjectId()).toBeUndefined();
    client.setSubjectId('account-42');
    expect(client.getSubjectId()).toBe('account-42');
  });

  /**
   * The id is NOT persisted with the decision. Who is logged in is the app's business
   * and can change between launches; baking a stale account id into a restored consent
   * record would attribute one person's consent to another.
   */
  it('is not written into the stored decision', async () => {
    const storage = memoryStorage();
    const client = createConsentClient({
      cbid: 'cb-1',
      apiUrl: 'https://cmp.example.com',
      storage,
      region: 'de',
      fetch: vi.fn(async () => new Response('', { status: 204 })) as unknown as typeof fetch,
    });
    client.setSubjectId('account-42');
    await client.accept();
    expect(await storage.getItem('CookieMunch')).not.toContain('account-42');
  });
});
