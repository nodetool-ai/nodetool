#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root, bin, scratchBase } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-cancel-'));
async function boundedCancel(fixture) {
  const output = path.join(dir, 'bounded.mp4');
  const cancelFile = path.join(dir, 'cancel');
  const started = performance.now();
  let audioAt;
  let cancelAt;
  let stderr = '';
  let lines = '';
  const child = spawn(bin, [fixture, '--export', output, '--cancel-file', cancelFile], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => {
    let budgetTimer;
    const startupTimer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`No audio/encoding progress within 30 s: ${stderr}`));
    }, 30000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => {
      stderr += data;
      lines += data;
      let newline;
      while ((newline = lines.indexOf('\n')) >= 0) {
        const line = lines.slice(0, newline);
        lines = lines.slice(newline + 1);
        if (!line.startsWith('export-progress ')) continue;
        const progress = JSON.parse(line.slice('export-progress '.length));
        if (progress.phase === 'audio') audioAt = performance.now();
        if (cancelAt === undefined && ['audio', 'encoding'].includes(progress.phase)) {
          clearTimeout(startupTimer);
          cancelAt = performance.now();
          fs.writeFileSync(cancelFile, 'cancel');
          budgetTimer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('B42: export did not exit within 3000 ms after creating the cancel file'));
          }, 3000);
        }
      }
    });
    child.once('error', error => { clearTimeout(startupTimer); clearTimeout(budgetTimer); reject(error); });
    child.once('close', (status, signal) => {
      clearTimeout(startupTimer);
      clearTimeout(budgetTimer);
      try {
        assert.ok(cancelAt !== undefined, `Cancel landed during audio or encoding: ${stderr}`);
        const elapsed = performance.now() - cancelAt;
        assert.equal(signal, null, stderr);
        assert.equal(status, 3, stderr);
        assert.ok(elapsed <= 3000, `B42: cancelled exit took ${elapsed.toFixed(1)} ms > 3000 ms`);
        assert.ok(!fs.existsSync(output), 'No cancelled output');
        fs.unlinkSync(cancelFile);
        assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(fixture)], 'No staging files after bounded cancel');
        console.log(`B42: PASS (cancel to exit ${elapsed.toFixed(1)} ms; audio phase observed ${(audioAt - started).toFixed(1)} ms after spawn)`);
        resolve();
      } catch (error) { reject(error); }
    });
  });
}
try {
  if (!process.argv.includes('--no-render')) {
    const doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/av-sync.json')));
    doc.durationMs = 300000;
    Object.assign(doc.clips[0], { startMs: 0, durationMs: 300000,
      mediaPath: path.join(root, 'fixtures', doc.clips[0].mediaPath) });
    const fixture = path.join(dir, 'bounded.json');
    fs.writeFileSync(fixture, JSON.stringify(doc));
    // Measure the complete offline mix separately, without waiting for 9000 video frames.
    const mix = path.join(dir, 'mix.f32');
    const started = performance.now();
    const rendered = spawnSync(bin, [fixture, '--render-audio', mix, '--to', '300000'], { encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.equal(fs.statSync(mix).size, 300000 * 48 * 8);
    console.log(`300000 ms fixture offline audio mix: ${(performance.now() - started).toFixed(1)} ms`);
    fs.unlinkSync(mix);
    await boundedCancel(fixture);
    fs.unlinkSync(fixture);
  }
  const fixture = path.join(root, 'fixtures/av-sync.json');
  const oversized = JSON.parse(fs.readFileSync(fixture));
  oversized.durationMs = 2184600;
  Object.assign(oversized.clips[0], { startMs: 0, durationMs: 2184600,
    mediaPath: path.join(root, 'fixtures', oversized.clips[0].mediaPath) });
  const oversizedFixture = path.join(dir, 'oversized.json');
  fs.writeFileSync(oversizedFixture, JSON.stringify(oversized));
  const limit = spawnSync(bin, [oversizedFixture, '--export', path.join(dir, 'oversized.zip'),
    '--format', 'png_sequence'], { encoding: 'utf8' });
  assert.equal(limit.error, undefined);
  assert.equal(limit.signal, null, limit.stderr);
  assert.equal(limit.status, 1, limit.stderr);
  assert.match(limit.stderr, /classic ZIP limit.*65535 entries/i);
  fs.unlinkSync(oversizedFixture);
  assert.deepEqual(fs.readdirSync(dir), [], 'Oversized ZIP leaves no output or staging files');
  console.log('PNG classic ZIP entry limit: PASS');
  const cancelled = spawnSync(bin, [fixture, '--export', path.join(dir, 'cancelled.zip'),
    '--format', 'png_sequence', '--cancel-after-frames', '0'], { encoding: 'utf8' });
  assert.equal(cancelled.error, undefined);
  assert.equal(cancelled.signal, null, cancelled.stderr);
  assert.equal(cancelled.status, 3, cancelled.stderr);
  assert.match(cancelled.stderr, /cancelled/i);
  assert.deepEqual(fs.readdirSync(dir), [], 'Early PNG cancellation leaves no output or staging files');
  console.log('PNG cancellation before rendering: PASS');
  for (const format of ['mp4', 'webm', 'png_sequence', 'wav', 'mp3']) {
    for (const mode of ['cancel', 'alpha', 'error']) {
      if (mode === 'error' && format === 'png_sequence') continue;
      if (process.argv.includes('--no-render') && mode === 'cancel' && !['wav', 'mp3'].includes(format)) continue;
      const out = path.join(dir, `out.${format}`);
      const fixture = path.join(root, 'fixtures/av-sync.json');
      const extra = mode === 'cancel' ? ['--cancel-after-frames', '2'] : mode === 'alpha' ? ['--alpha'] : ['--video-encoder', 'missing-export-test-encoder', '--audio-encoder', 'missing-export-test-encoder'];
      const result = spawnSync(bin, [fixture, '--export', out, '--format', format, ...extra], {
        encoding: 'utf8'
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null, `Clean exit, not a crash: ${result.stderr}`);
      assert.notEqual(result.status, 0, `${mode} ${format} must not succeed`);
      assert.match(result.stderr, mode === 'alpha' ? /transparency.*unavailable/i : mode === 'cancel' ? /cancelled/i : /encoder/i);
      assert.ok(!fs.existsSync(out), 'No output');
      assert.deepEqual(fs.readdirSync(dir), [], 'No new temporary files or folders');
      console.log(`${mode} ${format}: PASS`);
    }
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
