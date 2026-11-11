// Complete shipped documents, with local package media imported into a scratch store.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertImportedTreatments } from '../pixels/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';
import { prepareReferenceCli, importReference, cleanupReferenceCli } from '../tracking/reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(root, '../..');
export function loadExample(slug) {
  assert.match(slug, /^[a-z0-9-]+$/);
  const bundle = JSON.parse(fs.readFileSync(path.join(repo, 'packages/base-nodes/nodetool/examples/timelines', `${slug}.timeline.json`), 'utf8'));
  const document = { id: `example-${slug}`, projectId: 'examples', name: bundle.name,
    fps: bundle.fps, width: bundle.width, height: bundle.height, durationMs: bundle.durationMs,
    ...structuredClone(bundle.document), createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' };
  const original = structuredClone(document);
  for (const clip of document.clips) {
    if (clip.currentAssetId?.startsWith('package://')) {
      const relative = clip.currentAssetId.slice('package://'.length);
      const local = path.resolve(repo, 'packages/base-nodes/nodetool/assets', relative);
      assert(local.startsWith(path.join(repo, 'packages/base-nodes/nodetool/assets') + path.sep));
      assert(fs.existsSync(local) && fs.statSync(local).size > 0, `missing shipped media ${clip.id}: ${local}`);
      clip.mediaPath = local;
    }
  }
  assertPreserved(original, document);
  return { original, document };
}
export function assertPreserved(original, resolved) {
  const expected = structuredClone(original);
  let inspected = 0;
  for (const clip of expected.clips) {
    ++inspected;
    const imported = resolved.clips.find(item => item.id === clip.id);
    assert(imported, `missing clip ${clip.id}`);
    if (clip.currentAssetId?.startsWith('package://')) {
      const local = path.resolve(repo, 'packages/base-nodes/nodetool/assets', clip.currentAssetId.slice('package://'.length));
      assert.equal(imported.mediaPath, local, 'must use the exact shipped media source');
      assert(fs.existsSync(local));
      clip.mediaPath = local;
    }
  }
  assert(inspected > 0, 'must inspect shipped clips');
  assert.deepEqual(resolved, expected, 'only local mediaPath additions are allowed');
}
function referenceCli(directory) {
  const modules = path.join(directory, 'node_modules');
  if (!fs.existsSync(modules)) {
    fs.symlinkSync(path.join(repo, 'node_modules'), modules, 'dir');
  }
  return prepareReferenceCli(directory);
}
export function importGolden(file, frames, output, directory) {
  const cli = referenceCli(directory);
  try {
    return importReference(file, frames, output, directory, cli);
  } finally {
    cleanupReferenceCli(cli);
  }
}

export function main(argv) {
  const bin = path.resolve(argv[0] ?? path.join(root, 'build-f11/nodetool-timeline'));
  const binarySha256 = createHash('sha256').update(fs.readFileSync(bin)).digest('hex');
  const slugs = argv.slice(1).length ? argv.slice(1) : ['cadence', 'prism'];
  const run = fs.mkdtempSync(path.join(root, 'build/motion-shipped-'));
  const results = [];
  for (const slug of slugs) {
    const result = { slug, pass: false };
    results.push(result);
    try {
      const { document, original } = loadExample(slug);
      const total = Math.ceil(document.durationMs * document.fps / 1000);
      const frames = Array.from({ length: 8 }, (_, i) => Math.floor((i + 0.5) * total / 8));
      Object.assign(result, { clips: document.clips.length, media: document.clips.filter(clip => clip.mediaPath).length, frames });
      const directory = path.join(run, slug);
      fs.mkdirSync(directory);
      const file = path.join(directory, `${slug}.json`);
      const before = JSON.stringify(document);
      fs.writeFileSync(file, before);
      const web = path.join(directory, 'web');
      if (document.clips.some(clip => clip.mediaPath)) {
        importGolden(file, frames, web, directory);
        assertImportedTreatments(document, JSON.parse(fs.readFileSync(path.join(web, `${slug}.imported.json`), 'utf8')));
      } else {
        fs.mkdirSync(web);
        const home = path.join(directory, 'home');
        fs.mkdirSync(home);
        const cli = referenceCli(directory);
        let stdout;
        try {
          stdout = execFileSync(process.execPath, ['--conditions=nodetool-dev', '--import', path.join(repo, 'node_modules/tsx/dist/loader.mjs'),
            cli, 'timeline', 'render', file, '--stills', '--frames', frames.join(','),
            '--out', path.join(web, 'stills'), '--json'], { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, HOME: home, DB_PATH: path.join(home, 'nodetool.sqlite3'), ASSET_FOLDER: path.join(home, 'assets') } });
        } finally {
          cleanupReferenceCli(cli);
        }
        const summary = JSON.parse(stdout.slice(stdout.indexOf('{')));
        assert.deepEqual(summary.skippedClips, []);
        assert.deepEqual(summary.fontsUnavailable, []);
        fs.writeFileSync(path.join(web, 'summary.json'), JSON.stringify(summary, null, 2));
      }
      assert.equal(createHash('sha256').update(fs.readFileSync(bin)).digest('hex'), binarySha256, 'native binary changed during reference rendering');
      const native = path.join(directory, 'native');
      execFileSync(bin, [file, '--stills', native, '--still-frames', frames.join(','), '--decode', 'sw'], { stdio: 'pipe', timeout: 180000 });
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assertPreserved(original, document);
      Object.assign(result, { clips: document.clips.length, media: document.clips.filter(clip => clip.mediaPath).length,
        frames, ...comparePairs(frames, path.join(web, 'stills'), native, 40) });
    } catch (error) {
      result.error = String(error.stderr ?? error.stack).slice(-6000);
      if (result.frames) {
        Object.assign(result, comparePairs(result.frames, path.join(run, slug, 'web/stills'), path.join(run, slug, 'native'), 40));
        result.pass = false;
      }
    }
  }
  const report = { binary: bin, binarySha256, run, results };
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return results.length && results.every(result => result.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
