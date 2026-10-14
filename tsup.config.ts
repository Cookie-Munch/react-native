import { defineConfig } from 'tsup';
// The secure-store adapters load their native modules lazily via indirect specifiers, so
// they're never resolved at build time. Listing them external keeps esbuild from trying,
// so this package builds cleanly WITHOUT any of the optional native deps installed.
// geo is bundled into this package (it is not published), so its types are inlined too:
// a consumer's tsc must never see an import of '@cookiemunch/geo'.
export default defineConfig({ entry: { index: 'src/index.ts' }, format: ['esm'], dts: { resolve: [/^@cookiemunch\/geo/], compilerOptions: { rootDir: '..', baseUrl: '.', paths: { '@cookiemunch/geo/regulation': ['../geo/src/regulation.ts'] } } }, clean: true, sourcemap: true, external: ['react', 'react-native', 'expo-secure-store', 'react-native-keychain', '@react-native-async-storage/async-storage'] });
