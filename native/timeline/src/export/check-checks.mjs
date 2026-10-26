#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { psnr, psnrYuv, requireFrames, run, scratchBase } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-checks-'));
try {
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
