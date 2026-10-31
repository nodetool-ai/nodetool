import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stagePackageAssets } from '../lib/stage-package-assets.mjs';

describe('native runtime asset staging', () => {
  it('omits unavailable optional capabilities, rejects missing required assets and copies actual native files', async () => {
    const root=await mkdtemp(join(tmpdir(),'native-asset-stage-'));
    try {
      const dist=join(root,'dist'), out=join(root,'out'); await mkdir(dist); await mkdir(out);
      const asset={pkg:'@test/runtime',path:'native-worker',optional:true};
      expect((await stagePackageAssets([asset],out,()=>root)).size).toBe(0);
      await expect(stagePackageAssets([{...asset,optional:false}],out,()=>root)).rejects.toThrow('missing from build output');
      await writeFile(join(dist,asset.path),'native-binary-bytes',{mode:0o755});
      expect((await stagePackageAssets([asset],out,()=>root)).size).toBe(1);
      expect(await readFile(join(out,asset.path),'utf8')).toBe('native-binary-bytes');
      expect((await stat(join(out,asset.path))).mode & 0o111).not.toBe(0);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});

import { exportNativePlayer } from '../../packages/game-runtime/scripts/native-game-export.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { zstdDecompressSync } from 'node:zlib';
import ts from 'typescript';

it('keeps separately staged native artifacts across real Turbo cache hits and keys browser identity to the staged pair', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-turbo-cache-'));
  const repo = new URL('../../', import.meta.url);
  const configuration = ts.parseConfigFileTextToJson('turbo.json', await readFile(new URL('turbo.json', repo), 'utf8')).config;
  const turbo = new URL('node_modules/turbo/bin/turbo', repo);
  const binaries = ['native-game-worker', 'native-game-worker.exe'];
  const pair = ['native-game.mjs', 'native-game.wasm'];
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const writeJson = (path, value) => writeFile(path, JSON.stringify(value));
  const directories = Object.fromEntries(['runtime', 'renderer'].map(name => [name, join(root, 'packages', name)]));
  try {
    await mkdir(join(root, 'native/game/browser'), { recursive: true });
    await writeFile(join(root, 'native/game/browser/emsdk.version'), '6.0.13');
    await writeFile(join(root, '.gitignore'), 'dist/\n.turbo/\n');
    await writeJson(join(root, 'package.json'), { name: 'native-cache-regression', private: true, packageManager: 'npm@10.9.7', workspaces: ['packages/*'] });
    await writeJson(join(root, 'package-lock.json'), { name: 'native-cache-regression', lockfileVersion: 3, packages: { '': { workspaces: ['packages/*'] } } });
    const tasks = { build: configuration.tasks.build };
    for (const [name, directory] of Object.entries(directories)) {
      const packageName = `@nodetool-ai/game-${name}`;
      const task = configuration.tasks[`${packageName}#build`];
      if (task) { tasks[`${packageName}#build`] = task; }
      await mkdir(join(directory, 'dist'), { recursive: true });
      await mkdir(join(directory, 'scripts')); await mkdir(join(directory, 'src'));
      await writeFile(join(directory, 'src/index.ts'), 'required compiled output');
      await writeJson(join(directory, 'package.json'), { name: packageName, version: '1.0.0', scripts: { build: 'node scripts/build.mjs' }, ...(name === 'renderer' ? { dependencies: { '@nodetool-ai/game-runtime': '*' } } : {}) });
      await writeFile(join(directory, 'scripts/build.mjs'), `
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await writeFile('dist/index.js',await readFile('src/index.ts'));
await appendFile('../../build-executions.log',${JSON.stringify(name + '\n')});
${name === 'renderer' ? `for(const name of ['native-game-player.js','native-game-worker.js'])await writeFile('dist/'+name,'required generated browser JS');
const files=[];for(const name of ['native-game.mjs','native-game.wasm']){const bytes=await readFile('dist/'+name);files.push({path:name,digest:createHash('sha256').update(bytes).digest('hex')});}
await writeFile('dist/native-game-browser.json',JSON.stringify(files));` : ''}
`);
    }
    await writeJson(join(root, 'turbo.json'), { tasks });
    const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
    expect(git.status, git.stderr).toBe(0);
    const stage = async version => {
      for (const name of binaries) { await writeFile(join(directories.runtime, 'dist', name), Buffer.from(`\x7fELF\0staged-${version}`), { mode: 0o755 }); }
      await writeFile(join(directories.renderer, 'dist', pair[0]), `export default ${JSON.stringify(version)};`);
      // Valid empty WASM module with a versioned custom section.
      await writeFile(join(directories.renderer, 'dist', pair[1]), Buffer.from([0,97,115,109,1,0,0,0,0,2,1,version.charCodeAt(0)]));
    };
    const run = () => {
      const result = spawnSync(process.execPath, [turbo.pathname, 'run', 'build', '--cache=local:rw', '--no-daemon', '--output-logs=full'], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', CI: 'true' } });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout;
    };
    await stage('A'); run();
    for (const name of binaries) { await writeFile(join(directories.runtime, 'dist', name), Buffer.from(`\x7fELF\0fresh-${name}`)); }
    const fresh = new Map(await Promise.all(binaries.map(async name => [name, await readFile(join(directories.runtime, 'dist', name))])));
    await unlink(join(directories.runtime, 'dist/index.js'));
    await unlink(join(directories.renderer, 'dist/index.js'));
    await unlink(join(directories.renderer, 'dist/native-game-browser.json'));
    expect(run()).toContain('cache hit');
    expect((await readFile(join(root, 'build-executions.log'), 'utf8')).trim().split('\n')).toHaveLength(2);
    for (const [name, bytes] of fresh) { expect(await readFile(join(directories.runtime, 'dist', name))).toEqual(bytes); }
    for (const directory of Object.values(directories)) { expect(await readFile(join(directory, 'dist/index.js'), 'utf8')).toBe('required compiled output'); }
    const identityA = await readFile(join(directories.renderer, 'dist/native-game-browser.json'), 'utf8');
    for (const entry of JSON.parse(identityA)) { expect(entry.digest).toBe(digest(await readFile(join(directories.renderer, 'dist', entry.path)))); }
    await stage('B'); run();
    expect((await readFile(join(root, 'build-executions.log'), 'utf8')).trim().split('\n')).toHaveLength(3);
    const identityB = await readFile(join(directories.renderer, 'dist/native-game-browser.json'), 'utf8'); expect(identityB).not.toBe(identityA);
    for (const entry of JSON.parse(identityB)) { expect(entry.digest).toBe(digest(await readFile(join(directories.renderer, 'dist', entry.path)))); }
    await unlink(join(directories.renderer, 'dist/native-game-worker.js'));
    await unlink(join(directories.renderer, 'dist/native-game-browser.json'));
    expect(run()).toContain('cache hit');
    expect((await readFile(join(root, 'build-executions.log'), 'utf8')).trim().split('\n')).toHaveLength(3);
    expect(await readFile(join(directories.renderer, 'dist/native-game-worker.js'), 'utf8')).toBe('required generated browser JS');
    expect(await readFile(join(directories.renderer, 'dist/native-game-browser.json'), 'utf8')).toBe(identityB);
    for (const entry of JSON.parse(identityB)) { expect(entry.digest).toBe(digest(await readFile(join(directories.renderer, 'dist', entry.path)))); }
    const archives = (await readdir(join(root, '.turbo/cache'))).filter(name => name.endsWith('.tar.zst')); expect(archives.length).toBeGreaterThan(0);
    const inspectedArchives=[];
    for (const name of archives) {
      const tar = zstdDecompressSync(await readFile(join(root, '.turbo/cache', name)));
      const paths=[];let offset=0;
      while(offset+512<=tar.length){const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;paths.push(header.subarray(0,100).toString().split('\0')[0]);const size=parseInt(header.subarray(124,136).toString().replace(/\0/g,'').trim(),8)||0;offset+=512+Math.ceil(size/512)*512;}
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) { expect(binaries.concat(pair).some(name => path === name || path.endsWith('/'+name)), path).toBe(false); }
      inspectedArchives.push({archive:name,paths});
    }
    if(process.env.NODETOOL_NATIVE_CACHE_PROOF_DIR){
      const proof=process.env.NODETOOL_NATIVE_CACHE_PROOF_DIR;await mkdir(proof,{recursive:true});
      for(const name of archives){await writeFile(join(proof,name),await readFile(join(root,'.turbo/cache',name)));}
      await writeJson(join(proof,'archive-audit.json'),inspectedArchives);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it('rejects invalid content before publishing and preserves an existing destination', async () => {
  const root=await mkdtemp(join(tmpdir(),'native-export-negative-'));
  try {
    const output=join(root,'out'), document=join(root,'game.json');
    await mkdir(output); await writeFile(join(output,'keep'),'unchanged');
    await writeFile(document,JSON.stringify({engine:'wrong',assets:[]}));
    await expect(exportNativePlayer({document,output})).rejects.toThrow('already exists');
    expect(await readFile(join(output,'keep'),'utf8')).toBe('unchanged');
    const absent=join(root,'absent');
    await expect(exportNativePlayer({document,output:absent})).rejects.toThrow('dimensional document');
    expect(existsSync(absent)).toBe(false);
  } finally { await rm(root,{recursive:true,force:true}); }
});

it('rejects corrupt assets atomically without invoking a runtime', async () => {
  const root=await mkdtemp(join(tmpdir(),'native-export-asset-'));
  try {
    const runtime=join(root,'runtime'), output=join(root,'out'), document=join(root,'game.json');
    await mkdir(join(runtime,'bin'),{recursive:true});
    await mkdir(join(runtime,'share','nodetool-game','licenses'),{recursive:true});
    for(const name of ['game-player','game-worker']) { await writeFile(join(runtime,'bin',name),'#!/bin/sh\nexit 99\n',{mode:0o755}); }
    for(const name of ['QuickJS-LICENSE','Jolt-LICENSE','nlohmann-json-LICENSE']) { await writeFile(join(runtime,'share','nodetool-game','licenses',name),'license'); }
    await writeFile(join(root,'asset.bin'),'changed');
    const digest=createHash('sha256').update('expected').digest('hex');
    await writeFile(document,JSON.stringify({engine:'native-cpp-1',schemaVersion:4,dimension:'3d',assets:[{id:'asset',path:'asset.bin',digest,size:8}]}));
    await expect(exportNativePlayer({document,output,assetsRoot:root,runtimeDir:runtime})).rejects.toThrow('digest');
    expect(existsSync(output)).toBe(false);
    await expect((await import('node:fs/promises')).readdir(root).then(files=>files.some(name=>name.startsWith('.native-game-export-')))).resolves.toBe(false);
  } finally { await rm(root,{recursive:true,force:true}); }
});

it('admits only the explicit native version and dimension pairs for export', async () => {
  const root=await mkdtemp(join(tmpdir(),'native-export-dimension-'));
  try {
    const document=join(root,'game.json');
    for (const [schemaVersion,dimension] of [[4,'2d'],[5,'3d'],[5,'2d'],[4,'3d']]) {
      await writeFile(document,JSON.stringify({engine:'native-cpp-1',schemaVersion,dimension,assets:[]}));
      const result=exportNativePlayer({document,output:join(root,`${schemaVersion}-${dimension}`)});
      await expect(result).rejects.toThrow((schemaVersion===4&&dimension==='3d')||(schemaVersion===5&&dimension==='2d')?'Provide --build-dir':'dimensional document');
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});

import { exportNativeBrowserPlayer, NATIVE_BROWSER_FILES } from '../../packages/game-runtime/scripts/native-game-web-export.mjs';

it('fails the browser selfcheck when fixture discovery is empty', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'native-browser-empty-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/check-native-game-browser.mjs', '--fixtures', empty], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be nonempty');
  } finally { await rm(empty, { recursive: true, force: true }); }
});

it('stages a closed browser bundle atomically and rejects damaged runtime, assets, cancellation and destination reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-browser-export-'));
  try {
    const runtime = {}, files = [];
    for (const name of NATIVE_BROWSER_FILES) {
      runtime[name] = join(root, name);
      const bytes = Buffer.from(name === 'native-game.mjs' ? `export default async () => {
        const HEAPU8 = new Uint8Array(8 * 1024 * 1024);
        const response = new TextEncoder().encode(JSON.stringify({protocolVersion:1,requestId:'export-validate',status:'ok',result:{}}));
        return { HEAPU8, _ng_create:()=>1, _malloc:()=>1, _free(){}, _ng_destroy(){},
          _ng_dispatch(){HEAPU8.set(response,4*1024*1024);return 0;},
          _ng_response_pointer:()=>4*1024*1024,_ng_response_length:()=>response.length };
      };` : `fixture-${name}`);
      await writeFile(runtime[name], bytes);
      if (name !== 'native-game-browser.json') { files.push({ path: name, size: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') }); }
    }
    await writeFile(runtime['native-game-browser.json'], JSON.stringify({ engine: 'native-cpp-1', files }));
    const document = join(root, 'source.json');
    await writeFile(document, JSON.stringify({ engine: 'native-cpp-1', schemaVersion: 5, dimension: '2d', assets: [] }));
    const output = join(root, 'export');
    const report = await exportNativeBrowserPlayer({ document, output, runtime });
    expect(report.target).toBe('web');
    expect(report.files.length).toBeGreaterThan(6);
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain('wasm-unsafe-eval');
    await expect(exportNativeBrowserPlayer({ document, output, runtime })).rejects.toThrow('already exists');
    await expect(exportNativeBrowserPlayer({ document, output: join(root, 'unavailable'), runtime: {} })).rejects.toThrow('capability unavailable');
    const assetBytes = Buffer.from('owned local asset');
    const asset = { id: 'owned', path: 'owned.dat', size: assetBytes.length, digest: createHash('sha256').update(assetBytes).digest('hex') };
    await writeFile(join(root, asset.path), assetBytes);
    const writeDocument = assets => writeFile(document, JSON.stringify({ engine: 'native-cpp-1', schemaVersion: 5, dimension: '2d', assets }));
    await writeDocument([asset]);
    await exportNativeBrowserPlayer({ document, output: join(root, 'with-assets'), runtime });
    expect(await readFile(join(root, 'with-assets', 'assets', asset.path))).toEqual(assetBytes);
    await writeFile(join(root, asset.path), 'damaged');
    await expect(exportNativeBrowserPlayer({ document, output: join(root, 'bad-asset'), runtime })).rejects.toThrow('mismatch');
    expect(existsSync(join(root, 'bad-asset'))).toBe(false);
    await writeDocument([{ ...asset, path: '../escape' }]);
    await expect(exportNativeBrowserPlayer({ document, output: join(root, 'traversal'), runtime })).rejects.toThrow('Invalid prepared asset');
    await writeDocument([]);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(exportNativeBrowserPlayer({ document, output: join(root, 'cancelled'), runtime, signal: cancelled.signal })).rejects.toThrow();
    expect(existsSync(join(root, 'cancelled'))).toBe(false);
    await writeFile(runtime['native-game.wasm'], 'damaged');
    await expect(exportNativeBrowserPlayer({ document, output: join(root, 'damaged'), runtime })).rejects.toThrow('digest mismatch');
    expect(existsSync(join(root, 'damaged'))).toBe(false);
    await expect(exportNativeBrowserPlayer({ document, output: `${root}/a/../bad`, runtime: {} })).rejects.toThrow('Unsafe');
    await expect((await import('node:fs/promises')).readdir(root).then(names => names.filter(name => name.startsWith('.native-game-web-export-')))).resolves.toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
