import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');
const base = { absWorkingDir: root, bundle: true, platform: 'browser', target: 'es2022', format: 'esm', minify: true, conditions: ['nodetool-dev'], metafile: true, logLevel: 'warning' };
await mkdir(join(root, 'dist'), { recursive: true });
const inputs = new Set();
for (const [entry, name] of [['src/standalone-native-player.ts', 'native-game-player.js'], ['../game-runtime/src/native-browser/worker.ts', 'native-game-worker.js']]) {
  const result = await build({ ...base, write: !check, entryPoints: [join(root, entry)], outfile: join(root, 'dist', name) });
  if (check) {
    const generated = result.outputFiles?.[0];
    if (!generated || !Buffer.from(generated.contents).equals(await readFile(join(root, 'dist', name)))) { throw new Error(`Generated native browser artifact drift: ${name}`); }
  }
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input.includes('game-runtime/src/') && !input.includes('game-runtime/src/native-browser/')) { throw new Error(`Native browser bundle imported a runtime outside its browser host: ${input}`); }
    if (/game-runtime\/src\/(?:session(?:3d)?|physics|quickjs)|rapier|quickjs-ng-wasmfile|quickjs-emscripten/.test(input)) { throw new Error(`Legacy simulation dependency in native browser bundle: ${input}`); }
    inputs.add(input);
  }
}
const names = ['native-game-player.js', 'native-game-worker.js', 'native-game.mjs', 'native-game.wasm'];
const files = [];
let available = true;
for (const path of names) {
  let bytes;
  try { bytes = await readFile(join(root, 'dist', path)); }
  catch (error) { if (error.code === 'ENOENT' && /\.(?:mjs|wasm)$/.test(path)) { available = false; continue; } throw error; }
  if (!bytes.length) { throw new Error(`Empty native browser artifact: ${path}`); }
  files.push({ path, size: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') });
}
const notices = await readFile(join(root, '../game-runtime/scripts/native-game-notices.txt'));
files.push({ path: 'native-game-notices.txt', size: notices.length, digest: createHash('sha256').update(notices).digest('hex') });
// Browser compilation is a separately provisioned capability, never a build-time legacy fallback.
const version = (await readFile(join(root, '../../native/game/browser/emsdk.version'), 'utf8')).trim();
if (available) {
  const identity = JSON.stringify({ engine: 'native-cpp-1', emscriptenVersion: version, files, inputs: [...inputs].sort() }, null, 2) + '\n';
  if (check) {
    if (identity !== await readFile(join(root, 'dist/native-game-browser.json'), 'utf8')) { throw new Error('Generated native browser identity drift'); }
  } else { await writeFile(join(root, 'dist/native-game-browser.json'), identity); }
} else if (check) { throw new Error('Native browser capability unavailable: build the browser profile before checking it'); }
else { await rm(join(root, 'dist/native-game-browser.json'), { force: true }); }
