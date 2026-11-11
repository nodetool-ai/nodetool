#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, bin, run, exportFile, duration, scratchBase, decodeAudio } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-timing-'));
try {
  for (const test of [
    { name: 'range', fps: 30, extra: [], frames: 15 },
    { name: 'range-fps', fps: 24, extra: ['--fps', '24'], frames: 12 },
    { name: 'range-size', fps: 30, extra: ['--width', '320', '--height', '568'], frames: 15 },
    { name: 'range-fractional-grid', fps: 30000 / 1001, extra: [], frames: 15 }
  ]) {
    let fixture = path.join(root, 'fixtures/av-sync.json');
    if (test.name === 'range-fractional-grid') {
      const doc = JSON.parse(fs.readFileSync(fixture));
      doc.fps = test.fps;
      doc.clips[0].mediaPath = path.join(root, 'fixtures', doc.clips[0].mediaPath);
      fixture = path.join(dir, 'fractional-range.json');
      fs.writeFileSync(fixture, JSON.stringify(doc));
    }
    const out = path.join(dir, `${test.name}.mp4`);
    const result = exportFile(fixture, out, 'mp4', ['--start-ms', '250', '--end-ms', '750', ...test.extra]);
    assert.equal(result.startMs, 250);
    assert.equal(result.endMs, 750);
    assert.equal(result.frames, test.frames, 'Resolved range frame count');
    assert.equal(result.fps, test.fps);
    const streams = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', out]).stdout).streams;
    const video = streams.find(s => s.codec_type === 'video');
    assert.equal(Number(video.nb_read_frames), test.frames, 'Exact ranged video frame count');
    const [rateNum, rateDen] = video.avg_frame_rate.split('/').map(Number);
    assert.ok(Math.abs(rateNum / rateDen - test.fps) < 1e-8, 'Output stream frame rate');
    const [num, den] = video.time_base.split('/').map(Number);
    assert.ok(Math.abs(Number(video.duration_ts) - test.frames / test.fps * den / num) < 1e-8, 'Exact ranged duration_ts');
    const decoded = path.join(dir, 'range-audio.f32');
    decodeAudio(out, decoded);
    assert.equal(fs.statSync(decoded).size / 8, Math.round(test.frames / test.fps * 48000), 'Exact ranged decoded samples');
    if (test.name === 'range-size') {
      assert.equal(video.width, 320);
      assert.equal(video.height, 568);
      assert.equal(result.width, 320);
      assert.equal(result.height, 568);
    }
    console.log(`${test.name}: PASS (${test.frames} frames, ${video.duration_ts} ticks)`);
  }
  const invalid = spawnSync(bin, [path.join(root, 'fixtures/av-sync.json'), '--export', path.join(dir, 'empty.mp4'),
    '--start-ms', '999999'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /The export range is empty\./);
  for (const option of ['start-ms', 'end-ms', 'width', 'height', 'fps', 'video-bitrate']) {
    for (const value of ['nope', '-1', 'NaN', 'Infinity']) {
      const invalid = spawnSync(bin, [path.join(root, 'fixtures/av-sync.json'), '--export', path.join(dir, 'invalid.mp4'),
        `--${option}`, value], { encoding: 'utf8' });
      assert.equal(invalid.status, 2, invalid.stderr);
      assert.ok(invalid.stderr.includes(`error: ${option} must be a nonnegative number`), invalid.stderr);
    }
  }
  console.log('Empty range and invalid CLI numbers: PASS');
  for (const name of ['odd-size', 'av-sync', 'av-sync-fractional', 'fractional-grid', 'sequence-trim']) {
    let fixture = path.join(root, 'fixtures', `${name}.json`);
    let doc;
    if (name === 'fractional-grid' || name === 'odd-size' || name === 'sequence-trim') {
      doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/av-sync-fractional.json')));
      doc.fps = 30000 / 1001;
      doc.clips[0].startMs = 0;
      doc.clips[0].durationMs = 1073;
      doc.durationMs = name === 'sequence-trim' ? 573 : 1073;
      if (name === 'odd-size') {
        doc.width = 321;
        doc.height = 181;
      }
      doc.clips[0].mediaPath = path.join(root, 'fixtures/media/flash-beep-720p30.mov');
      fixture = path.join(dir, `${name}.json`);
      fs.writeFileSync(fixture, JSON.stringify(doc));
    } else doc = JSON.parse(fs.readFileSync(fixture));
    const frames = Math.max(1, Math.round(duration(doc) * doc.fps / 1000));
    const out = path.join(dir, `${name}.mp4`);
    exportFile(fixture, out);
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', out]).stdout);
    const video = probe.streams.find(s => s.codec_type === 'video');
    assert.equal(video.width, Math.max(2, Math.floor(doc.width / 2) * 2), 'Even export width');
    assert.equal(video.height, Math.max(2, Math.floor(doc.height / 2) * 2), 'Even export height');
    assert.equal(Number(video.nb_read_frames), frames, 'Exact video frame count');
    const [num, den] = video.time_base.split('/').map(Number);
    const expectedTicks = frames / doc.fps * den / num;
    assert.ok(Math.abs(Number(video.duration_ts) - expectedTicks) < 1e-8, `Exact video duration in ticks: ${video.duration_ts} vs ${expectedTicks}`);
    const decoded = path.join(dir, 'audio.f32');
    decodeAudio(out, decoded);
    assert.equal(fs.statSync(decoded).size / 8, Math.round(frames / doc.fps * 48000), 'Exact decoded sample count');
    console.log(`${name}: PASS (${frames} frames, ${video.duration_ts} ticks)`);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
