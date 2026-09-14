/**
 * Secure-storage adapters for the consent decision. Each implements the injectable
 * {@link MobileStorage} interface the consent client already consumes, backed by a
 * different native module:
 *
 *   - `expoSecureStore()`   → expo-secure-store          (OS keystore, Expo apps)
 *   - `rnKeychainStore()`   → react-native-keychain      (Keychain / Keystore, bare RN)
 *   - `asyncStorageStore()` → @react-native-async-storage/async-storage (non-secure)
 *
 * Every native module is an OPTIONAL peer dependency. Mirroring
 * @cookiemunch/electron's secure-store, the module is loaded LAZILY via an indirect
 * import specifier, so this package builds and type-checks WITHOUT any of them
 * installed — you only need the one you actually use. Tests inject a fake module via the
 * `module` option, avoiding the dynamic import entirely.
 */

import type { MobileStorage } from './client.js';

// ---------------------------------------------------------------------------
// Structural types for the small slices of each native module we touch. We do
// NOT `import` (not even `import type`) from the real packages: they must stay
// out of the dependency/type graph so the build succeeds without them.
// ---------------------------------------------------------------------------

/** Subset of `expo-secure-store`. */
export interface ExpoSecureStoreModule {
  getItemAsync(key: string, options?: unknown): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
  deleteItemAsync(key: string, options?: unknown): Promise<void>;
}

/** A single credential entry from `react-native-keychain`. */
export interface KeychainCredentials {
  username: string;
  password: string;
}

/** Subset of `react-native-keychain`. */
export interface KeychainModule {
  setGenericPassword(
    username: string,
    password: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  getGenericPassword(options?: Record<string, unknown>): Promise<KeychainCredentials | false>;
  resetGenericPassword(options?: Record<string, unknown>): Promise<boolean>;
}

/** Subset of `@react-native-async-storage/async-storage`'s default export. */
export interface AsyncStorageStatic {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Lazily resolve a native module: return the injected one if given, otherwise dynamically
 * import it through an INDIRECT specifier so the compiler/bundler never resolves it
 * statically. `pick` unwraps a possible `default` export (async-storage) or picks the
 * namespace itself (expo/keychain expose named functions).
 */
function lazyModule<T>(specifier: string, injected: T | undefined, pick: (mod: unknown) => T) {
  let resolved: Promise<T> | null = null;
  return () => {
    if (resolved) return resolved;
    resolved = (async () => {
      if (injected) return injected;
      // Indirect specifier: keeps the compiler/bundler from statically resolving the
      // module, so this package builds and type-checks WITHOUT it installed. At runtime
      // (inside an app that depends on it) the module is present.
      const spec = specifier;
      return pick(await import(spec));
    })();
    return resolved;
  };
}

// ---------------------------------------------------------------------------
// expo-secure-store
// ---------------------------------------------------------------------------

export interface ExpoSecureStoreOptions {
  /** Inject the module (tests / to skip the dynamic import). Defaults to `expo-secure-store`. */
  module?: ExpoSecureStoreModule;
  /** Passed through as expo's `SecureStoreOptions` (e.g. `keychainAccessible`). */
  options?: unknown;
}

/** {@link MobileStorage} backed by `expo-secure-store` (encrypted OS keystore). */
export function expoSecureStore(opts: ExpoSecureStoreOptions = {}): MobileStorage {
  const load = lazyModule<ExpoSecureStoreModule>('expo-secure-store', opts.module, (mod) => {
    const m = mod as ExpoSecureStoreModule & { default?: ExpoSecureStoreModule };
    return m.default && typeof m.default.getItemAsync === 'function' ? m.default : m;
  });
  return {
    async getItem(key) {
      return (await load()).getItemAsync(key, opts.options);
    },
    async setItem(key, value) {
      await (await load()).setItemAsync(key, value, opts.options);
    },
    async removeItem(key) {
      await (await load()).deleteItemAsync(key, opts.options);
    },
  };
}

// ---------------------------------------------------------------------------
// react-native-keychain
// ---------------------------------------------------------------------------

export interface RnKeychainStoreOptions {
  /** Inject the module (tests / to skip the dynamic import). Defaults to `react-native-keychain`. */
  module?: KeychainModule;
  /**
   * Keychain stores one credential per `service`, so each storage key maps to its own
   * service. Defaults to using the key itself; override to namespace it
   * (e.g. `(k) => 'com.acme.' + k`).
   */
  service?: (key: string) => string;
  /** Extra options merged into every Keychain call (e.g. `accessControl`, `accessible`). */
  options?: Record<string, unknown>;
}

/** {@link MobileStorage} backed by `react-native-keychain` (Keychain / Keystore). */
export function rnKeychainStore(opts: RnKeychainStoreOptions = {}): MobileStorage {
  const serviceFor = opts.service ?? ((k: string) => k);
  const load = lazyModule<KeychainModule>(
    'react-native-keychain',
    opts.module,
    (mod) => {
      const m = mod as KeychainModule & { default?: KeychainModule };
      return m.default && typeof m.default.getGenericPassword === 'function' ? m.default : m;
    },
  );
  const withService = (key: string) => ({ ...opts.options, service: serviceFor(key) });
  return {
    async getItem(key) {
      const creds = await (await load()).getGenericPassword(withService(key));
      return creds ? creds.password : null;
    },
    async setItem(key, value) {
      await (await load()).setGenericPassword(key, value, withService(key));
    },
    async removeItem(key) {
      await (await load()).resetGenericPassword(withService(key));
    },
  };
}

// ---------------------------------------------------------------------------
// @react-native-async-storage/async-storage (non-secure fallback)
// ---------------------------------------------------------------------------

export interface AsyncStorageStoreOptions {
  /** Inject the module (tests / to skip the dynamic import). Defaults to the async-storage default export. */
  module?: AsyncStorageStatic;
}

/**
 * {@link MobileStorage} backed by `@react-native-async-storage/async-storage`.
 * NOTE: AsyncStorage is NOT encrypted — prefer {@link expoSecureStore} or
 * {@link rnKeychainStore} where available. Provided as a convenient fallback and for
 * apps that already depend on it.
 */
export function asyncStorageStore(opts: AsyncStorageStoreOptions = {}): MobileStorage {
  const load = lazyModule<AsyncStorageStatic>(
    '@react-native-async-storage/async-storage',
    opts.module,
    (mod) => {
      const m = mod as AsyncStorageStatic & { default?: AsyncStorageStatic };
      return m.default && typeof m.default.getItem === 'function' ? m.default : m;
    },
  );
  return {
    async getItem(key) {
      return (await load()).getItem(key);
    },
    async setItem(key, value) {
      await (await load()).setItem(key, value);
    },
    async removeItem(key) {
      await (await load()).removeItem(key);
    },
  };
}
