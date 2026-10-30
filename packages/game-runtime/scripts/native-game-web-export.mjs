#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const NATIVE_BROWSER_FILES = ['native-game.mjs', 'native-game.wasm', 'native-game-worker.js', 'native-game-player.js', 'native-game-browser.json', 'native-game-notices.txt'];
function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096 && !isAbsolute(path) && !/[\\:%?#\u0000-\u001f]/u.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
}
function inside(root, path) {
  const value = relative(root, path);
  return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
async function validateNativeDocument(document, staged, validationRoot, signal) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(validationRoot ?? tmpdir(), '.native-game-web-validate-'));
  try {
    const modulePath = join(directory, 'native-game.mjs');
    for (const name of ['native-game.mjs', 'native-game.wasm']) {
      const path = join(directory, name);
      await writeFile(path, staged.get(name));
      if (hash(await readFile(path)) !== hash(staged.get(name))) { throw new Error('Native validation runtime staging verification failed'); }
    }
    signal?.throwIfAborted();
    const factory = (await import(pathToFileURL(modulePath).href)).default;
    if (typeof factory !== 'function') { throw new Error('Native browser module has no factory'); }
    const module = await factory({ locateFile(name) { if (name !== 'native-game.wasm') { throw new Error('Undeclared native validation runtime file'); } return join(directory, name); }, print() {}, printErr() {} });
    signal?.throwIfAborted();
    const context = module._ng_create();
    if (!context) { throw new Error('Native browser validation context creation failed'); }
    let pointer = 0;
    try {
      const requestId = 'export-validate';
      const bytes = new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, requestId, operation: 'validate', document }));
      pointer = module._malloc(bytes.length);
      if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer + bytes.length > module.HEAPU8.byteLength) { throw new Error('Native browser validation allocation failed'); }
      module.HEAPU8.set(bytes, pointer);
      const status = module._ng_dispatch(context, pointer, bytes.length);
      const resultPointer = module._ng_response_pointer(context), length = module._ng_response_length(context), heap = module.HEAPU8;
      if ((status !== 0 && status !== 1) || !Number.isSafeInteger(resultPointer) || resultPointer < 0 || !Number.isSafeInteger(length) || length < 1 || length > 16 * 1024 * 1024 || resultPointer + length > heap.byteLength) { throw new Error('Invalid native browser validation response'); }
      const response = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(heap.slice(resultPointer, resultPointer + length)));
      if (status !== 0 || response.status !== 'ok' || response.protocolVersion !== 1 || response.requestId !== requestId) {
        throw new Error(`Native browser document validation failed: ${response.error?.message ?? 'invalid response'}`);
      }
      signal?.throwIfAborted();
    } finally { if (pointer) { module._free(pointer); } module._ng_destroy(context); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function exportNativeBrowserPlayer(options) {
  options.signal?.throwIfAborted();
  if (typeof options.output !== 'string' || options.output.split(/[\\/]/).includes('..')) { throw new Error('Unsafe export destination'); }
  const output = resolve(options.output);
  try { await lstat(output); throw new Error('Export destination already exists'); } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
  const documentBytes = await readFile(options.document);
  if (documentBytes.length > 4 * 1024 * 1024) { throw new Error('Document exceeds 4 MiB'); }
  const document = JSON.parse(documentBytes.toString('utf8'));
  if (document.engine !== 'native-cpp-1' || !((document.schemaVersion === 4 && document.dimension === '3d') || (document.schemaVersion === 5 && document.dimension === '2d')) || !Array.isArray(document.assets)) { throw new Error('Expected native C++ dimensional document'); }
  if (document.assets.length > 4096) { throw new Error('Native browser asset count exceeds 4096 entry budget'); }
  const runtime = options.runtime;
  if (!runtime || NATIVE_BROWSER_FILES.some(name => typeof runtime[name] !== 'string')) { throw new Error('Native browser capability unavailable: install the browser runtime profile'); }
  const identity = JSON.parse(await readFile(runtime['native-game-browser.json'], 'utf8'));
  if (identity.engine !== 'native-cpp-1' || !Array.isArray(identity.files) || identity.files.length < 4) { throw new Error('Invalid native browser artifact identity'); }
  const staged = new Map();
  for (const name of NATIVE_BROWSER_FILES) {
    options.signal?.throwIfAborted();
    const bytes = await readFile(runtime[name]);
    if (!bytes.length) { throw new Error(`Empty browser artifact: ${name}`); }
    if (name !== 'native-game-browser.json') {
      const item = identity.files.find(entry => entry.path === name);
      if (!item || item.size !== bytes.length || item.digest !== hash(bytes)) { throw new Error(`Browser runtime digest mismatch: ${name}`); }
    }
    staged.set(name, bytes);
  }
  const assetsRoot = await realpath(resolve(options.assetsRoot ?? dirname(options.document)));
  const ids = new Set(), paths = new Set(); let assetBytes = 0;
  for (const asset of document.assets) {
    options.signal?.throwIfAborted();
    if (typeof asset.id !== 'string' || ids.has(asset.id) || paths.has(asset.path) || !safePath(asset.path) || !/^[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 64 * 1024 * 1024) { throw new Error('Invalid prepared asset entry'); }
    ids.add(asset.id); paths.add(asset.path);
    const source = await realpath(resolve(assetsRoot, asset.path));
    if (!inside(assetsRoot, source) || !(await lstat(source)).isFile()) { throw new Error(`Asset leaves prepared root: ${asset.id}`); }
    const bytes = await readFile(source); assetBytes += bytes.length;
    if (assetBytes > 256 * 1024 * 1024 || bytes.length !== asset.size || hash(bytes) !== asset.digest) { throw new Error(`Asset digest, size or total budget mismatch: ${asset.id}`); }
    staged.set(`assets/${asset.path}`, bytes);
  }
  for (const asset of document.assets) { for (const id of asset.dependencies ?? []) { if (!ids.has(id)) { throw new Error(`Missing asset dependency: ${id}`); } } }
  await validateNativeDocument(document, staged, options.validationRoot, options.signal);
  staged.set('game.json', Buffer.from(JSON.stringify(document)));
  staged.set('assets.manifest.json', Buffer.from(JSON.stringify(document.assets)));
  staged.set('index.html', Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\'; worker-src \'self\'; connect-src \'self\'; img-src \'self\' blob:; media-src \'self\' blob:; style-src \'self\'; object-src \'none\'; base-uri \'none\'"><title>Native game</title><link rel="stylesheet" href="styles.css"></head><body><canvas id="game"></canvas><div id="hud"></div><p id="status" role="status">Starting native game…</p><script type="module" src="native-game-player.js"></script></body></html>'));
  staged.set('styles.css', Buffer.from('html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}canvas{display:block;width:100%;height:100%}#hud{position:absolute;inset:0;pointer-events:none}#status{position:absolute;top:0;color:white;background:black;font:16px sans-serif}'));
  const inventory = [...staged].map(([path, bytes]) => ({ path, size: bytes.length, digest: hash(bytes) }));
  const report = { engine: document.engine, schemaVersion: document.schemaVersion, dimension: document.dimension, target: 'web', entry: 'index.html', assetBytes, files: inventory };
  staged.set('bundle.json', Buffer.from(JSON.stringify(report, null, 2)));
  options.signal?.throwIfAborted();
  await mkdir(dirname(output), { recursive: true });
  const parent = await realpath(dirname(output));
  const stage = await mkdtemp(join(parent, '.native-game-web-export-'));
  try {
    for (const [path, bytes] of staged) {
      options.signal?.throwIfAborted();
      const target = join(stage, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
      if (hash(await readFile(target)) !== hash(bytes)) { throw new Error(`Staging verification failed: ${path}`); }
    }
    options.signal?.throwIfAborted();
    try { await lstat(output); throw new Error('Export destination appeared during staging'); } catch (error) { if (error.code !== 'ENOENT') { throw error; } }
    await rename(stage, output);
    return { ...report, output };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Native browser export cancelled'));
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    const options = JSON.parse(process.argv[2]);
    const { files, ...summary } = await exportNativeBrowserPlayer({ ...options, signal: controller.signal });
    console.log(JSON.stringify({ ...summary, fileCount: files.length + 1 }));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
