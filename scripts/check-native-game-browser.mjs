#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { checkNativeBrowserHost } from '../packages/game-renderer/scripts/check-native-browser-host.mjs';
// SwANGLE's Vulkan Xcb display needs a valid X server even in headless Chromium.
if (process.platform === 'linux' && process.env.NODETOOL_NATIVE_BROWSER_XVFB !== '1') {
  const result = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, NODETOOL_NATIVE_BROWSER_XVFB: '1' }
  });
  if (result.error) { throw result.error; }
  process.exit(result.status ?? 1);
}
const { values } = parseArgs({ options: { fixtures: { type: 'string', default: 'packages/game-renderer/tests' }, 'native-player': { type: 'string', default: process.env.NODETOOL_NATIVE_GAME_PLAYER }, 'native-runtime': { type: 'string', default: process.env.NODETOOL_NATIVE_GAME_RUNTIME_DIR }, 'native-worker': { type: 'string', default: process.env.NODETOOL_NATIVE_GAME_WORKER ?? 'native/game/build/game-worker' } } });
const fixtures = (await readdir(values.fixtures)).filter(name => name === 'native-browser-export.test.ts');
if (fixtures.length !== 1) { throw new Error('Native browser fixture discovery must be nonempty and unambiguous'); }
const identity = spawnSync(process.execPath, ['packages/game-renderer/scripts/bundle-native-browser.mjs', '--check'], { stdio: 'inherit' });
if (identity.error || identity.status !== 0) { throw new Error('Build the native browser profile before checking installed exports'); }
const parity = spawnSync(process.execPath, ['native/game/tests/native-wasm-parity.mjs', values['native-worker'], 'packages/game-renderer/dist/native-game.mjs'], { stdio: 'inherit' });
if (parity.error || parity.status !== 0) { throw new Error('Native worker and WebAssembly semantic parity failed'); }
await checkNativeBrowserHost('packages/game-renderer/dist');
const environment = { ...process.env, NODETOOL_NATIVE_BROWSER_PROFILE: '1', NODETOOL_NATIVE_GAME_WORKER: resolve(values['native-worker']) };
if (values['native-player']) { environment.NODETOOL_NATIVE_GAME_PLAYER = resolve(values['native-player']); environment.NATIVE_GAME_PIXEL_PLAYER = resolve(values['native-player']); }
if (values['native-runtime']) { environment.NODETOOL_NATIVE_GAME_RUNTIME_DIR = resolve(values['native-runtime']); }
for (const [cwd, args] of [
  ['.', ['scripts/run-vitest.mjs', 'run', '--config', 'vitest.config.ts', 'scripts/__tests__/native-game-delivery.test.mjs']],
  ['packages/game-renderer', ['../../scripts/run-vitest.mjs', 'run', 'tests/native-browser-export.test.ts', 'tests/native-browser-player-startup.test.ts', 'tests/native-browser2d-pixels.test.ts', 'tests/native-post3d.test.ts', 'tests/native-browser3d-visual.test.ts', 'tests/native-browser3d-vertex-materials.test.ts', 'tests/native-browser3d-vertex-pixels.test.ts']],
  ['packages/cli', ['../../scripts/run-vitest.mjs', 'run', 'tests/game-native-cpp.test.ts']],
  ['packages/agents', ['../../scripts/run-vitest.mjs', 'run', 'tests/capabilities-native-cpp-game.test.ts']]
]) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: environment });
  if (result.error || result.status !== 0) { throw new Error(`Native browser check failed: ${result.error?.message ?? result.status}`); }
}
if (values['native-player']) {
  const result = spawnSync(process.execPath, ['../../scripts/run-vitest.mjs', 'run', 'tests/native-browser3d-parity.test.ts'], {
    cwd: 'packages/game-renderer', stdio: 'inherit',
    env: { ...process.env, NODETOOL_NATIVE_GAME_PLAYER: values['native-player'], NATIVE_GAME_PIXEL_PLAYER: values['native-player'] }
  });
  if (result.error || result.status !== 0) { throw new Error(`Native/browser pixel parity failed: ${result.error?.message ?? result.status}`); }
}
for (const reference of ['nativeNormalReference.mjs', 'nativeBsdfReference.mjs']) {
  const result = spawnSync(process.execPath, ['--conditions=nodetool-dev', '--import=tsx', `packages/game-renderer/tests/fixtures/${reference}`], {
    stdio: 'inherit', env: environment
  });
  if (result.error || result.status !== 0) { throw new Error(`Native model reference failed: ${reference}: ${result.error?.message ?? result.status}`); }
}
