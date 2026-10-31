import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const source = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  sdk: { type: 'string', default: process.env.EMSDK },
  'build-dir': { type: 'string' },
  'output-dir': { type: 'string' },
} });
if (!values.sdk || !values['build-dir'] || !values['output-dir']) {
  throw new Error('Usage: node native/game/browser/build.mjs --sdk <emsdk> --build-dir <directory> --output-dir <directory>');
}
const sdk = resolve(values.sdk);
const build = resolve(values['build-dir']);
const output = resolve(values['output-dir']);
const requiredVersion = readFileSync(resolve(source, 'emsdk.version'), 'utf8').trim();
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error(`${command} failed with exit ${result.status}: ${result.stderr ?? ''}`); }
  return result.stdout;
};
const version = run(resolve(sdk, 'upstream/emscripten/emcc'), ['--version'], true);
if (!version.split('\n')[0].includes(` ${requiredVersion} `)) { throw new Error(`Emscripten ${requiredVersion} is required`); }
run(resolve(sdk, 'upstream/emscripten/emcmake'), ['cmake', '-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON']);
run('cmake', ['--build', build, '--target', 'native-game', '-j2']);
const commands = JSON.parse(readFileSync(resolve(build, 'compile_commands.json'), 'utf8'));
if (commands.length === 0 || commands.some(entry => /Qt|AudioDevice\.cpp|host\/Worker\.cpp|\-pthread/.test(entry.command + entry.file))) {
  throw new Error('Browser compilation must contain portable sources and exclude Qt, device audio, stdio and native threads');
}
mkdirSync(output, { recursive: true });
for (const name of ['native-game.mjs', 'native-game.wasm']) { copyFileSync(resolve(build, name), resolve(output, name)); }
console.log(`Browser runtime built with Emscripten ${requiredVersion}`);
