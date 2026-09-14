# @cookiemunch/react-native

Cookie Munch SDK for **React Native** (and Expo). It gives a mobile app the same things
the web embed gives a website:

1. **Consent capture** — an implied default until the user decides, then an explicit
   accept / decline / custom decision (`<ConsentProvider>` + `useConsent()` + a drop-in
   `<ConsentBanner />`).
2. **An auditable ledger record** — every decision is POSTed to the Cookie Munch API
   (`POST /api/v1/consent`) so it lands in the tamper-evident, hash-chained consent log.
   Decisions are persisted locally first, so a decision is never lost offline.
3. **Gating** — the native equivalent of the web embed's prior-blocking: analytics /
   telemetry SDKs are initialized **only after** the relevant consent category is granted.

The API mirrors [`@cookiemunch/electron`](../electron) so the mobile and desktop SDKs
feel identical (same categories, same explicit/implied method, `onChange`, pluggable
storage, and an identical `createConsentGate`).

## Install

```bash
pnpm add @cookiemunch/react-native
```

`react` and `react-native` are peer dependencies. The secure-storage adapters below each
sit behind an **optional** peer dependency — install only the one you use. This package
builds and type-checks without any of them installed.

## Secure storage

The consent client persists to any injected `MobileStorage`. Three adapters are provided:

```ts
import { expoSecureStore, rnKeychainStore, asyncStorageStore } from '@cookiemunch/react-native';

// Expo apps — OS keystore (encrypted). Requires: expo-secure-store
const storage = expoSecureStore();

// Bare React Native — Keychain (iOS) / Keystore (Android). Requires: react-native-keychain
const storage = rnKeychainStore();

// Non-secure fallback. Requires: @react-native-async-storage/async-storage
const storage = asyncStorageStore();
```

Then:

```tsx
import { ConsentProvider, ConsentBanner } from '@cookiemunch/react-native/src/RNConsentBanner';

<ConsentProvider options={{ cbid: 'YOUR_CBID', apiUrl: 'https://your.cookiemunch', storage }}>
  <App />
  <ConsentBanner />
</ConsentProvider>
```

> AsyncStorage is **not** encrypted — prefer `expoSecureStore()` or `rnKeychainStore()`
> for the consent record where available.

## Gate your analytics SDKs

Mobile apps can't rewrite `<script>` tags the way the web embed does, so instead you
**defer initializing** each SDK until its consent category is granted. `createConsentGate`
runs your init function exactly once — immediately if consent is already granted,
otherwise the moment it becomes granted — and never before, and never twice. It returns a
cancel function.

```ts
import { createConsentClient, createConsentGate, expoSecureStore } from '@cookiemunch/react-native';

const client = createConsentClient({ cbid: 'YOUR_CBID', apiUrl: 'https://your.cookiemunch', storage: expoSecureStore() });
await client.load();
const gate = createConsentGate(client);
```

Categories: `necessary` (always granted), `preferences`, `statistics`, `marketing`.

### Sentry (error monitoring → `statistics`)

```ts
import * as Sentry from '@sentry/react-native';

gate.gate('statistics', () => {
  Sentry.init({ dsn: 'https://…@…ingest.sentry.io/…' });
});
```

### PostHog (product analytics → `statistics`)

```ts
import PostHog from 'posthog-react-native';

let posthog: PostHog | undefined;
gate.gate('statistics', () => {
  posthog = new PostHog('phc_…', { host: 'https://us.i.posthog.com' });
});
```

### Amplitude (product analytics → `statistics`)

```ts
import { init as amplitudeInit } from '@amplitude/analytics-react-native';

gate.gate('statistics', () => {
  amplitudeInit('AMPLITUDE_API_KEY');
});
```

### Firebase Analytics (→ `statistics`)

Firebase auto-initializes, so instead of blocking init you toggle collection. Disable it
by default (in `firebase.json`: `"analytics_auto_collection_enabled": false`) and enable
it only after consent:

```ts
import analytics from '@react-native-firebase/analytics';

gate.gate('statistics', () => {
  analytics().setAnalyticsCollectionEnabled(true);
});
```

### Google Analytics 4 — GA4 (→ `statistics`)

On React Native, GA4 is Firebase Analytics (`@react-native-firebase/analytics`); use the
Firebase recipe above. If instead you send GA4 Measurement Protocol hits yourself, gate
the sender:

```ts
let ga4Enabled = false;
gate.gate('statistics', () => {
  ga4Enabled = true;
});

function sendGa4Event(name: string, params: Record<string, unknown>) {
  if (!ga4Enabled) return; // no hits before consent
  void fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=G-XXXX&api_secret=SECRET`,
    { method: 'POST', body: JSON.stringify({ client_id: '…', events: [{ name, params }] }) },
  );
}
```

### Marketing SDKs → `marketing`

Anything used for advertising / retargeting (Meta, TikTok, ad-attribution SDKs) belongs
behind `marketing`, not `statistics`:

```ts
gate.gate('marketing', () => {
  initAdSdk();
});
```

On iOS, also gate App Tracking Transparency on `marketing` — only call
`requestTrackingPermissionsAsync()` (expo-tracking-transparency) **after** the user grants
`marketing`, so the OS prompt and your consent banner stay consistent.

### Reacting to consent changes

`gate.gate(...)` fires once. To turn a signal off when the user later withdraws consent,
subscribe to the client instead:

```ts
client.onChange((state) => {
  analytics().setAnalyticsCollectionEnabled(state.statistics);
});
```
