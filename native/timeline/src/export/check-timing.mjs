#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, run, exportFile, duration, scratchBase } from './check-export.mjs';
const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-timing-'));
try {
  for (const name of ['odd-size', 'av-sync', 'av-sync-fractional', 'fractional-grid']) {
    let fixture = path.join(root, 'fixtures', `${name}.json`);
    let doc;
    if (name === 'fractional-grid' || name === 'odd-size') {
      doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/av-sync-fractional.json')));
      doc.fps = 30000 / 1001;
      doc.clips[0].startMs = 0;
      doc.clips[0].durationMs = 1073;
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
    run('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vn', '-f', 'f32le', '-ar', '48000', '-ac', '2', decoded]);
    assert.equal(fs.statSync(decoded).size / 8, Math.round(frames / doc.fps * 48000), 'Exact decoded sample count');
    console.log(`${name}: PASS (${frames} frames, ${video.duration_ts} ticks)`);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
