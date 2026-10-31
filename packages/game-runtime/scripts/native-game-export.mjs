#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, cp, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { platform, arch } from 'node:os';
import { fileURLToPath } from 'node:url';

async function run(command, args, options = {}) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 4 * 1024 * 1024) { child.kill(); } });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-65536); });
    const timer = setTimeout(() => child.kill(), 120000);
    child.once('error', reject);
    child.once('close', (code, signal) => { clearTimeout(timer); if (code === 0) { resolveRun(output); } else { reject(new Error(`${command} failed (${signal ?? code}): ${errors}`)); } });
  });
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function inside(root, path) { const rel = relative(root, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function files(root, path = root) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const candidate = join(path, entry.name);
    if (entry.isDirectory()) { result.push(...await files(root, candidate)); }
    else if (entry.isSymbolicLink()) {
      const target = await realpath(candidate);
      if (!inside(root, target) || !(await stat(target)).isFile()) { throw new Error(`Runtime symlink escapes distribution or targets a directory: ${candidate}`); }
      await rm(candidate); await copyFile(target,candidate); result.push(candidate);
    } else if (entry.isFile()) { result.push(candidate); }
  }
  return result;
}

/** Export only verified authored content and a deployed runtime, never the host environment. */
export async function exportNativePlayer(options) {
  const output = resolve(options.output);
  if (await exists(output)) { throw new Error('Export destination already exists'); }
  const sourcePath = resolve(options.document);
  const bytes = await readFile(sourcePath);
  if (bytes.length > 4 * 1024 * 1024) { throw new Error('Document exceeds 4 MiB'); }
  const document = JSON.parse(bytes.toString('utf8'));
  document.assets ??= [];
  if (document.engine !== 'native-cpp-1' || !((document.schemaVersion === 4 && document.dimension === '3d') || (document.schemaVersion === 5 && document.dimension === '2d')) || !Array.isArray(document.assets) || document.assets.length > 100000) { throw new Error('Expected native C++ dimensional document with prepared asset manifest'); }
  await mkdir(dirname(output), { recursive: true });
  const stage = await mkdtemp(join(dirname(output), '.native-game-export-'));
  const root = await realpath(resolve(options.assetsRoot ?? dirname(sourcePath)));
  try {
    if (options.runtimeDir) {
      for (const entry of await readdir(resolve(options.runtimeDir))) {
        await cp(join(resolve(options.runtimeDir), entry), join(stage,entry), { recursive:true,force:false,errorOnExist:true,verbatimSymlinks:true });
      }
    } else {
      if (!options.buildDir) { throw new Error('Provide --build-dir or --runtime-dir containing a deployed native player'); }
      await run('cmake', ['--install', resolve(options.buildDir), '--prefix', stage, '--strip']);
    }
    await files(stage);
    const player = join(stage, 'bin', platform() === 'win32' ? 'game-player.exe' : 'game-player');
    const worker = join(stage, 'bin', platform() === 'win32' ? 'game-worker.exe' : 'game-worker');
    await access(player, constants.X_OK); await access(worker, constants.X_OK);
    for (const notice of ['QuickJS-LICENSE', 'Jolt-LICENSE', 'nlohmann-json-LICENSE']) { await access(join(stage, 'share', 'nodetool-game', 'licenses', notice)); }
    await mkdir(join(stage, 'assets'), {recursive:true});
    const manifest = new Map(); let total = 0;
    for (const asset of document.assets) {
      if (typeof asset.id !== 'string' || manifest.has(asset.id) || typeof asset.path !== 'string' || isAbsolute(asset.path) || asset.path.includes('\\') || asset.path.split('/').some(part => !part || part === '..' || part === '.') || !/^[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 64 * 1024 * 1024) { throw new Error('Invalid prepared asset entry'); }
      const source = await realpath(resolve(root, asset.path));
      if (!inside(root, source) || !(await stat(source)).isFile()) { throw new Error(`Asset leaves prepared root: ${asset.id}`); }
      const data = await readFile(source); total += data.length;
      if (total > 256 * 1024 * 1024 || data.length !== asset.size || sha(data) !== asset.digest) { throw new Error(`Asset digest, size or total budget mismatch: ${asset.id}`); }
      manifest.set(asset.id, asset);
      const target = join(stage, 'assets', asset.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data);
    }
    for (const asset of manifest.values()) { for (const id of asset.dependencies ?? []) { if (!manifest.has(id)) { throw new Error(`Missing asset dependency: ${id}`); } } }
    const documentText = JSON.stringify(document);
    await writeFile(join(stage, 'game.json'), documentText);
    const smoke = join(stage, '.export-check'); await mkdir(smoke);
    const args = [join(stage, 'game.json'), '--assets-dir', join(stage, 'assets'), '--capture', join(smoke, 'frame.png'), '--tick', '0', '--report', join(smoke, 'render.json')];
    // Keep display/driver configuration, but remove application credentials and development loaders.
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','HOME','TMPDIR','LANG','LC_ALL','VK_ICD_FILENAMES','VK_DRIVER_FILES','QSG_RHI_BACKEND','QT_QPA_PLATFORM'].includes(key)));
    if (platform() === 'linux') { environment.QT_QPA_PLATFORM='xcb'; environment.QSG_RHI_BACKEND='vulkan'; }
    const command = platform() === 'linux' ? 'xvfb-run' : player;
    const smokeArgs = command === player ? args : ['-a', player, ...args];
    await run(command, smokeArgs, { cwd: stage, env: environment });
    const smokeReport = JSON.parse(await readFile(join(smoke, 'render.json'), 'utf8')); delete smokeReport.capture; smokeReport.captureVerified=true; await rm(smoke, { recursive: true });
    const launcher = platform() === 'win32' ? 'play.cmd' : 'play';
    const launchText = platform() === 'win32' ? '@echo off\r\n"%~dp0bin\\game-player.exe" "%~dp0game.json" --assets-dir "%~dp0assets" %*\r\n' : '#!/bin/sh\nTASK_GAME_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$TASK_GAME_DIR/bin/game-player" "$TASK_GAME_DIR/game.json" --assets-dir "$TASK_GAME_DIR/assets" "$@"\n';
    await writeFile(join(stage, launcher), launchText); await chmod(join(stage, launcher), 0o755);
    const inventory = [];
    for (const path of await files(stage)) { const data = await readFile(path); inventory.push({ path: relative(stage, path).split(sep).join('/'), size: data.length, digest: sha(data) }); }
    inventory.sort((a,b) => a.path.localeCompare(b.path));
    const report = { engine: 'native-cpp-1', schemaVersion: document.schemaVersion, dimension: document.dimension, platform: platform(), architecture: arch(), documentDigest: sha(Buffer.from(documentText)), assetBytes: total, entry: launcher, files: inventory, smoke: smokeReport };
    await writeFile(join(stage, 'bundle.json'), JSON.stringify(report, null, 2) + '\n');
    await rename(stage, output);
    return { ...report, output };
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let i=2;i<process.argv.length;i+=2) {
      const key = process.argv[i], value = process.argv[i+1];
      if (!value || !['--document','--assets-root','--build-dir','--runtime-dir','--output'].includes(key)) { throw new Error('Usage: native-game-export --document FILE --assets-root DIR (--build-dir DIR | --runtime-dir DIR) --output DIR'); }
      options[{'--document':'document','--assets-root':'assetsRoot','--build-dir':'buildDir','--runtime-dir':'runtimeDir','--output':'output'}[key]] = value;
    }
    if (!options.document || !options.output) { throw new Error('Document and output are required'); }
    console.log(JSON.stringify(await exportNativePlayer(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
