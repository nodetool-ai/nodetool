import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { textEncodingBanner } from '../guest/text-encoding-banner.mjs';
import { capabilityPlugins } from '../guest/host/plugins.mjs';
import { parityPlugins } from '../guest/parity/profile.mjs';
await build({ entryPoints: [process.argv[3] ?? fileURLToPath(new URL('./timeline-process.test.mjs', import.meta.url))], outfile: process.argv[2],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', banner: { js: textEncodingBanner },
  plugins: [...capabilityPlugins(), ...await parityPlugins({ modules: [], builtinShims: {} })] });
