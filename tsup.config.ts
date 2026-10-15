import { defineConfig } from 'tsup';
// The secure-store adapters load their native modules lazily via indirect specifiers, so
// they're never resolved at build time. Listing them external keeps esbuild from trying,
// so this package builds cleanly WITHOUT any of the optional native deps installed.
// geo is bundled into this package (it is not published), so its types are inlined too:
// a consumer's tsc must never see an import of '@cookiemunch/geo'. The first path is the
// workspace; the second is the public mirror, where geo ships as a local package under
// bundled/geo (scripts/mirror-sdks.mjs). Not via node_modules: the .d.ts bundler leaves a
// node_modules file's own imports external, so `./us-states.js` would dangle.
export default defineConfig({ entry: { index: 'src/index.ts' }, format: ['esm'], dts: { resolve: [/^@cookiemunch\/geo/], compilerOptions: { rootDir: '..', baseUrl: '.', paths: { '@cookiemunch/geo/regulation': ['../geo/src/regulation.ts', './bundled/geo/src/regulation.ts'] } } }, clean: true, sourcemap: true, external: ['react', 'react-native', 'expo-secure-store', 'react-native-keychain', '@react-native-async-storage/async-storage'] });
