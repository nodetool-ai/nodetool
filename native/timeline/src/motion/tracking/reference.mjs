import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { goldenAudioSource } from '../shipped/golden-audio.mjs';
const repo = fileURLToPath(new URL('../../../../../',import.meta.url));
const root = path.join(repo,'native/timeline');
const copies = new Map();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function prepareReferenceCli(run) {
  const cli = path.join(run,'cli');
  fs.copyFileSync(path.join(repo,'package.json'),path.join(run,'package.json'));
  const originalTarget = path.join(repo,'packages/cli/src/timeline-debug/target.ts');
  const originalHash = hash(originalTarget);
  try {
  fs.cpSync(path.join(repo,'packages/cli/src'),path.join(cli,'src'),{recursive:true});
  fs.copyFileSync(path.join(repo,'packages/cli/package.json'),path.join(cli,'package.json'));
  fs.symlinkSync(path.join(repo,'packages/cli/node_modules'),path.join(cli,'node_modules'),'dir');
  const file = path.join(cli,'src/timeline-debug/target.ts');
  const source = fs.readFileSync(file,'utf8');
  const needle = '  if (record.camera2d !== undefined) {';
  const fields = '  if (Array.isArray(record.mediaTracks)) {\n    document.mediaTracks = record.mediaTracks as TimelineDocument["mediaTracks"];\n  }\n  if (record.tempo !== undefined) {\n    document.tempo = record.tempo as TimelineDocument["tempo"];\n  }\n';
  assert.equal(source.split(needle).length,2,'CLI projection hook must match exactly once');
  const patched = source.includes(fields) ? source : source.replace(needle,fields+needle);
  fs.writeFileSync(file,patched);
  const entry = path.join(cli,'src/nodetool.ts');
  copies.set(entry,{directory:cli,source:originalTarget,hash:originalHash});
  return entry;
  } catch (error) { fs.rmSync(cli,{recursive:true,force:true}); throw error; }
}
export function cleanupReferenceCli(cli) {
  const copy = copies.get(cli);
  assert(copy,'reference CLI must be registered');
  try { assert.equal(hash(copy.source),copy.hash,'shared CLI source changed during reference render'); }
  finally { fs.rmSync(copy.directory,{recursive:true,force:true}); copies.delete(cli); }
}
export function importReference(file,frames,output,directory,cli) {
  const importer = path.join(directory,'golden-import.mjs');
  const sourceFile = path.join(root,'scripts/golden-import.mjs');
  const sourceHash = hash(sourceFile);
  const source = goldenAudioSource(fs.readFileSync(sourceFile,'utf8'));
  const replacements = [
    ['const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");',`const root = ${JSON.stringify(root)};`],
    ['const store = path.join(root, "build", "golden", "store");',`const store = ${JSON.stringify(path.join(directory,'store'))};`],
    ['    "npm",\n    ["run", "--silent", "dev:nodetool", "--", "timeline", "render", copy, "--stills", "--frames", args.frames, "--out", stillsDir, "--json"],',
      `    process.execPath,\n    ["--conditions=nodetool-dev", "--import", ${JSON.stringify(path.join(repo,'node_modules/tsx/dist/loader.mjs'))}, ${JSON.stringify(cli)}, "timeline", "render", copy, "--stills", "--frames", args.frames, "--out", stillsDir, "--json"],`]
  ];
  let patched = source;
  for (const [before,after] of replacements) {
    assert.equal(patched.split(before).length,2,'golden importer hook must match exactly once');
    patched = patched.replace(before,after);
  }
  fs.writeFileSync(importer,patched);
  try { return execFileSync(process.execPath,[importer,file,'--frames',frames.join(','),'--out',output],{stdio:'pipe',timeout:240000}); }
  finally {
    fs.rmSync(importer,{force:true});
    assert.equal(hash(sourceFile),sourceHash,'shared importer source changed during render');
  }
}
