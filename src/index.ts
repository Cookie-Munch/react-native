export * from './client.js';

// Gating (native equivalent of the web embed's prior-blocking)
export { createConsentGate } from './gate.js';
export type { ConsentGate, ConsentSource, ConsentCategory } from './gate.js';

// "Store this only with consent" — the native counterpart of @cookiemunch/react's consentCookie
export { consentStoredValue } from './consent-value.js';

// Secure-storage adapters (each behind an OPTIONAL native peer dependency)
export { expoSecureStore, rnKeychainStore, asyncStorageStore } from './secure-store.js';
export type {
  ExpoSecureStoreModule,
  ExpoSecureStoreOptions,
  KeychainModule,
  KeychainCredentials,
  RnKeychainStoreOptions,
  AsyncStorageStatic,
  AsyncStorageStoreOptions,
} from './secure-store.js';
