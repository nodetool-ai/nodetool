// Diagnostic only: the current native renderer omits camera depth-of-field.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './fixture.mjs';
import { prepareReferenceCli, cleanupReferenceCli } from '../tracking/reference.mjs';
import { comparePairs, measure } from '../../render2d/check-example-stills.mjs';

const binary = path.resolve(process.argv[2]);
const full = process.argv[3] === '--full';
const digest = () => createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const binaryHash = digest();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(root, '../..');
const run = fs.mkdtempSync(path.join(root, 'build/motion-dof-'));
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(run, 'node_modules'), 'dir');
const cli = prepareReferenceCli(run);
try {
  const rows = [];
  for (const enabled of [true, false]) {
    const mode = enabled ? 'on' : 'off';
    const dir = path.join(run, mode);
    fs.mkdirSync(dir);
    const file = path.join(dir, 'input.json');
    const document = JSON.stringify(makeFixture(enabled, full));
    fs.writeFileSync(file, document);
    const web = path.join(dir, 'web/stills');
    fs.mkdirSync(web, { recursive: true });
    execFileSync(process.execPath, ['--conditions=nodetool-dev', '--import', path.join(repo, 'node_modules/tsx/dist/loader.mjs'),
      cli, 'timeline', 'render', file, '--stills', '--frames', '48', '--out', web, '--json'], { stdio: 'pipe', timeout: 180000 });
    const native = path.join(dir, 'native');
    execFileSync(binary, [file, '--stills', native, '--still-frames', '48', '--decode', 'sw'], { stdio: 'pipe', timeout: 180000 });
    assert.equal(fs.readFileSync(file, 'utf8'), document);
    assert.equal(digest(), binaryHash);
    rows.push({ mode, comparison: comparePairs([48], web, native, 40) });
  }
  const png = 'frame_000048.png';
  const webChange = measure(path.join(run, 'on/web/stills', png), path.join(run, 'off/web/stills', png));
  const nativeChange = measure(path.join(run, 'on/native', png), path.join(run, 'off/native', png));
  assert(Number.isFinite(webChange), 'the aperture must visibly change the reference');
  if (full) assert(nativeChange > 60, 'native aperture change must be small relative to the reference');
  else assert.equal(nativeChange, Infinity, 'the isolated native baseline must be insensitive to aperture');
  const report = { run, binaryHash, full, rows, webChange, nativeChange: Number.isFinite(nativeChange) ? nativeChange : 'inf' };
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { cleanupReferenceCli(cli); }
