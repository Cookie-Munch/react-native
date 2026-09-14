import { defineConfig } from 'tsup';
// The secure-store adapters load their native modules lazily via indirect specifiers, so
// they're never resolved at build time. Listing them external keeps esbuild from trying,
// so this package builds cleanly WITHOUT any of the optional native deps installed.
export default defineConfig({ entry: { index: 'src/index.ts' }, format: ['esm'], dts: true, clean: true, sourcemap: true, external: ['react', 'react-native', 'expo-secure-store', 'react-native-keychain', '@react-native-async-storage/async-storage'] });
