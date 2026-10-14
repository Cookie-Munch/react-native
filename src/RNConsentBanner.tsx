/**
 * React Native consent banner + hook. Drop into a native app. Requires
 * `react`, `react-native`, and `@react-native-async-storage/async-storage`.
 * The consent logic lives in ./client (framework-agnostic, fully tested); this is
 * the native UI + a useConsent hook around it.
 *
 * iOS note: gate App Tracking Transparency on the `marketing` category — only call
 * `requestTrackingPermissionsAsync()` (expo-tracking-transparency) AFTER the user
 * grants marketing here, so the OS prompt and your consent banner stay consistent.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { createConsentClient, type ConsentClient, type ConsentClientOptions, type MobileConsentState } from './client.js';

interface Ctx {
  state: MobileConsentState | null;
  client: ConsentClient;
}
const ConsentCtx = createContext<Ctx | null>(null);

export function ConsentProvider({ options, children }: { options: ConsentClientOptions; children: React.ReactNode }) {
  const client = useMemo(() => createConsentClient(options), [options]);
  const [state, setState] = useState<MobileConsentState | null>(null);
  useEffect(() => {
    let alive = true;
    client.load().then((s) => alive && setState(s));
    return client.onChange((s) => setState({ ...s }));
  }, [client]);
  return <ConsentCtx.Provider value={{ state, client }}>{children}</ConsentCtx.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentCtx);
  if (!ctx) throw new Error('useConsent must be used within a <ConsentProvider>');
  const { state, client } = ctx;
  return {
    consent: state,
    hasResponse: client.hasResponse(),
    acceptAll: () => client.accept(),
    rejectAll: () => client.decline(),
    submitCustom: client.submitCustom.bind(client),
  };
}

/**
 * Whether `category` is granted right now; re-renders when it changes. `necessary` is
 * always true; anything else is false until the stored decision has loaded.
 */
export function useConsentValue(category: 'necessary' | 'preferences' | 'statistics' | 'marketing'): boolean {
  const { consent } = useConsent();
  return category === 'necessary' || consent?.[category] === true;
}

/** Shows the banner only until the user has responded. */
export function ConsentBanner() {
  const { consent, hasResponse, acceptAll, rejectAll } = useConsent();
  if (!consent || hasResponse) return null;
  return (
    <View style={styles.wrap} accessibilityViewIsModal accessibilityRole="alert">
      <Text style={styles.title}>We value your privacy</Text>
      <Text style={styles.body}>
        We use cookies. Choose which ones you allow.
      </Text>
      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.ghost]} onPress={rejectAll} accessibilityRole="button">
          <Text style={styles.ghostText}>Reject all</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.primary]} onPress={acceptAll} accessibilityRole="button">
          <Text style={styles.primaryText}>Allow all</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e0ded3' },
  title: { fontSize: 18, fontWeight: '700', color: '#14181c', marginBottom: 6 },
  body: { fontSize: 14, color: '#2a3138', marginBottom: 16, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  ghost: { borderWidth: 1, borderColor: '#cfccbf', backgroundColor: 'transparent' },
  ghostText: { color: '#14181c', fontWeight: '600' },
  primary: { backgroundColor: '#0e6e5c' },
  primaryText: { color: '#ffffff', fontWeight: '600' },
});
