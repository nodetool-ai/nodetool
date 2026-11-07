import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { textEncodingBanner } from '../guest/text-encoding-banner.mjs';
import { capabilityPlugins } from '../guest/host/plugins.mjs';
import { parityPlugins } from '../guest/parity/profile.mjs';
const modules = [
  fileURLToPath(new URL('./webassembly-node-fixture.mjs', import.meta.url)),
  ...['constant', 'control', 'input', 'subgraph', 'variable'].map(name => `@nodetool-ai/core-nodes/nodes/${name}`),
];
// Dependency evaluation precedes entry.mjs's equivalent console installation.
const consoleBanner = `globalThis.console ??= Object.fromEntries(['log','warn','error','info','debug'].map(level => [level, (...args) => globalThis.__host.log(level, args.map(String).join(' '))]));`;
await build({ entryPoints: [fileURLToPath(new URL('../guest/entry.mjs', import.meta.url))],
  outfile: process.argv[2], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  banner: { js: textEncodingBanner + consoleBanner },
  plugins: [...capabilityPlugins(), ...await parityPlugins({ modules })] });
if (process.argv[3]) {
  const { writeFile } = await import('node:fs/promises');
  const { yogaLayoutFixture } = await import('./webassembly-yoga-fixture.mjs');
  await writeFile(process.argv[3], JSON.stringify(yogaLayoutFixture()));
}
