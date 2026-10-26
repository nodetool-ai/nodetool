#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, bin, run, exportFile, duration, scratchBase } from './check-export.mjs';

const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-audio-'));
function floats(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length % 8, 0, 'Whole stereo samples');
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function compare(reference, decoded, wav) {
  assert.equal(decoded.length, reference.length, 'Exact decoded audio sample count');
  let signal = 0, noise = 0, max = 0;
  for (let i = 0; i < reference.length; i++) {
    signal += reference[i] ** 2;
    noise += (reference[i] - decoded[i]) ** 2;
    max = Math.max(max, Math.abs(reference[i] - decoded[i]));
  }
  assert.ok(signal > 0, 'Compared audible samples');
  if (wav) assert.ok(max <= 1 / 32768 + 1e-7, `WAV quantization error ${max}`);
  else {
    const snr = 10 * Math.log10(signal / noise);
    // AAC at 192 kbit/s should keep RMS error below 3.2% of the signal.
    assert.ok(snr >= 30, `AAC SNR ${snr} < 30 dB`);
    let bestLag = 0, best = -Infinity;
    for (let lag = -64; lag <= 64; lag++) {
      let dot = 0;
      for (let i = 128; i < reference.length - 128; i += 2) dot += reference[i] * decoded[i + lag * 2];
      if (dot > best) { best = dot; bestLag = lag; }
    }
    assert.equal(bestLag, 0, 'Cross-correlation peak at lag 0');
    console.log(`AAC SNR ${snr.toFixed(2)} dB, lag ${bestLag}`);
  }
}
try {
  for (const name of ['audio-mix', 'av-sync']) {
    const fixture = path.join(root, 'fixtures', `${name}.json`);
    const doc = JSON.parse(fs.readFileSync(fixture));
    for (const format of (process.argv.includes('--wav-only') ? ['wav'] : ['mp4', 'wav'])) {
      const ms = format === 'mp4' ? Math.max(1, Math.round(duration(doc) * doc.fps / 1000)) * 1000 / doc.fps : duration(doc);
      const ref = path.join(dir, 'reference.f32');
      run(bin, [fixture, '--render-audio', ref, '--to', String(ms)]);
      const file = path.join(dir, `${name}.${format}`);
      exportFile(fixture, file, format);
      const decoded = path.join(dir, 'decoded.f32');
      run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-f', 'f32le', '-ar', '48000', '-ac', '2', decoded]);
      compare(floats(ref), floats(decoded), format === 'wav');
      console.log(`${name} ${format}: PASS`);
    }
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
