import { describe, it, expect } from 'vitest';
import {
  expoSecureStore,
  rnKeychainStore,
  asyncStorageStore,
  type ExpoSecureStoreModule,
  type KeychainModule,
  type KeychainCredentials,
  type AsyncStorageStatic,
} from '../src/secure-store.js';

// A fake expo-secure-store: a plain in-memory map behind the async API.
function fakeExpo(): ExpoSecureStoreModule & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItemAsync: async (k) => store.get(k) ?? null,
    setItemAsync: async (k, v) => void store.set(k, v),
    deleteItemAsync: async (k) => void store.delete(k),
  };
}

// A fake react-native-keychain: one credential per `service`.
function fakeKeychain(): KeychainModule & { store: Map<string, KeychainCredentials> } {
  const store = new Map<string, KeychainCredentials>();
  const serviceOf = (options?: Record<string, unknown>) => String(options?.service ?? '__default__');
  return {
    store,
    setGenericPassword: async (username, password, options) => {
      store.set(serviceOf(options), { username, password });
      return true;
    },
    getGenericPassword: async (options) => store.get(serviceOf(options)) ?? false,
    resetGenericPassword: async (options) => store.delete(serviceOf(options)),
  };
}

// A fake AsyncStorage.
function fakeAsyncStorage(): AsyncStorageStatic & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  };
}

describe('expoSecureStore', () => {
  it('round-trips through the injected module and removes', async () => {
    const mod = fakeExpo();
    const s = expoSecureStore({ module: mod });
    expect(await s.getItem('CookieMunch')).toBeNull();
    await s.setItem('CookieMunch', '{"marketing":true}');
    expect(await s.getItem('CookieMunch')).toBe('{"marketing":true}');
    expect(mod.store.get('CookieMunch')).toBe('{"marketing":true}');
    await s.removeItem('CookieMunch');
    expect(await s.getItem('CookieMunch')).toBeNull();
  });
});

describe('rnKeychainStore', () => {
  it('round-trips using the key as the keychain service and removes', async () => {
    const mod = fakeKeychain();
    const s = rnKeychainStore({ module: mod });
    expect(await s.getItem('CookieMunch')).toBeNull();
    await s.setItem('CookieMunch', '{"statistics":true}');
    expect(await s.getItem('CookieMunch')).toBe('{"statistics":true}');
    // Stored under a per-key service, isolated from other keys.
    expect(mod.store.get('CookieMunch')?.password).toBe('{"statistics":true}');
    expect(await s.getItem('other')).toBeNull();
    await s.removeItem('CookieMunch');
    expect(await s.getItem('CookieMunch')).toBeNull();
  });

  it('honours a custom service namespacing function', async () => {
    const mod = fakeKeychain();
    const s = rnKeychainStore({ module: mod, service: (k) => `com.acme.${k}` });
    await s.setItem('CookieMunch', 'v');
    expect(mod.store.has('com.acme.CookieMunch')).toBe(true);
    expect(await s.getItem('CookieMunch')).toBe('v');
  });
});

describe('asyncStorageStore', () => {
  it('round-trips through the injected module and removes', async () => {
    const mod = fakeAsyncStorage();
    const s = asyncStorageStore({ module: mod });
    expect(await s.getItem('CookieMunch')).toBeNull();
    await s.setItem('CookieMunch', '{"preferences":true}');
    expect(await s.getItem('CookieMunch')).toBe('{"preferences":true}');
    expect(mod.store.get('CookieMunch')).toBe('{"preferences":true}');
    await s.removeItem('CookieMunch');
    expect(await s.getItem('CookieMunch')).toBeNull();
  });
});
