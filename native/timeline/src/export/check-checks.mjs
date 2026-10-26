#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { goldenOutputBase, psnr, psnrYuv, requireFrames, requireFixtureCoverage, root, run, scratchBase } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-checks-'));
try {
  const build = path.join(root, 'build');
  const repo = path.resolve(root, '../..');
  // Mirror golden-import's repository/build guard without clearing its shared scratch store.
  const inside = (child, parent) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  const acceptsGoldenOutput = output => inside(output, build)
    || (!inside(output, repo) && !inside(repo, output));
  assert.equal(acceptsGoldenOutput(path.join(root, 'build-sanitize', 'fixture-gold')), false);
  assert.equal(goldenOutputBase(path.join(build, 'nodetool-timeline')), build,
    'Release golden output stays beside the binary');
  for (const folder of ['build-sanitize', 'build-debug']) {
    const base = goldenOutputBase(path.join(root, folder, 'nodetool-timeline'));
    const output = path.join(base, 'nt-export-golden-guard', 'fixture-gold');
    assert.ok(acceptsGoldenOutput(output), `${folder} golden output must pass golden-import's path guard: ${output}`);
    assert.ok(inside(output, build), `${folder} golden output must be inside build/`);
  }
  const external = path.join(path.parse(repo).root, 'nt-export-external-build');
  assert.equal(goldenOutputBase(path.join(external, 'nodetool-timeline')), external,
    'External golden output stays beside the binary');
  console.log('Golden output paths accepted: build-sanitize and build-debug use build/; build and external paths unchanged');
  const covered = [{ fixture: 'compared.json', frame: 0, psnr: Infinity }];
  assert.throws(() => requireFixtureCoverage(['compared.json', 'missing.json'], covered), /Missing fixture missing.json/);
  assert.throws(() => requireFixtureCoverage([], covered), /Expected no media fixtures/);
  assert.throws(() => requireFixtureCoverage(['missing.json'], [], ['missing.json']), /Unknown unsupported fixture missing.json/);
  assert.throws(() => requireFixtureCoverage(['compared.json'], covered, ['video-rejections.json']), /Unexpected unmet fixture/);
  requireFixtureCoverage(['compared.json'], covered);
  requireFixtureCoverage(['compared.json', 'video-rejections.json'], covered, ['video-rejections.json']);
  console.log('Planted missing fixture rejected; empty fixture set and unlisted exclusions rejected');
  const keys = ['QT_QPA_PLATFORM', 'QSG_RHI_BACKEND', 'QT_QUICK_BACKEND'];
  const inherited = JSON.parse(run(process.execPath, ['-e',
    `process.stdout.write(JSON.stringify(${JSON.stringify(keys)}.map(key => process.env[key] ?? null)))`]).stdout);
  assert.deepEqual(inherited, keys.map(key => process.env[key] ?? null), 'Child processes inherit the Qt environment unchanged');
  const pictures = ['red', 'blue'].map(color => {
    const file = path.join(dir, `${color}.png`);
    run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=64x64`, '-frames:v', '1', file]);
    return file;
  });
  const value = psnr(...pictures);
  assert.throws(() => requireFrames([{ fixture: 'deliberately shifted red/blue cut', frame: 0, psnr: value }]), /PSNR .* < 40 dB/);
  console.log(`Planted shifted frame rejected: PSNR ${value} < 40 dB`);
  assert.throws(() => requireFrames([]), /Compared no frames/);
  assert.throws(() => psnr(pictures[0], path.join(dir, 'missing.png')), /Missing frame/);
  requireFrames([{ fixture: 'identical', frame: 0, psnr: psnr(pictures[0], pictures[0]) }]);
  // The 4:2:0 measure: a red-then-blue movie against the red still.
  const movie = path.join(dir, 'cut.mp4');
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:size=64x64:rate=1:duration=1',
    '-f', 'lavfi', '-i', 'color=c=blue:size=64x64:rate=1:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_range', 'tv', movie]);
  const own = psnrYuv(pictures[0], movie, 0, 64, 64);
  requireFrames([{ fixture: 'yuv same frame', frame: 0, psnr: own }]);
  const shifted = psnrYuv(pictures[0], movie, 1, 64, 64);
  assert.throws(() => requireFrames([{ fixture: 'yuv shifted frame', frame: 1, psnr: shifted }]), /PSNR .* < 40 dB/);
  assert.throws(() => psnrYuv(pictures[0], movie, 5, 64, 64), /Missing frame 5/);
  console.log(`4:2:0 measure: same frame ${own} dB, shifted frame ${shifted} dB rejected, missing frame rejected`);
  console.log('export_check_guards: PASS (shifted, missing, empty rejected; identical accepted)');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
