import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createScratchSession } from '../../scripts/scratch-server.mjs';

const native = fileURLToPath(new URL('../../', import.meta.url));
const repo = path.resolve(native, '../..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-assets-import-'));
const session = createScratchSession({ work, repo, assertInWork: candidate => {
  if (!candidate.startsWith(work + path.sep)) { throw new Error('outside scratch folder'); }
  return candidate;
} });
try {
  let server;
  try {
    server = await session.startServer('assets', 18000 + (process.pid % 20000));
  } catch (error) {
    console.log(`SKIP: scratch server unavailable: ${error.message}`);
    const log = path.join(work, 'assets/server.log');
    if (fs.existsSync(log)) { console.log(fs.readFileSync(log, 'utf8').split('\n').slice(-12).join('\n')); }
    if (process.env.NT_REQUIRE_SCRATCH_SERVER === '1') { throw error; }
    process.exitCode = 77;
  }
  if (server) {
    await session.assertScratch(server.base);
    const { stdout } = await promisify(execFile)(process.argv[2], [server.base,
      path.join(native, 'fixtures/media/seek-360p30.mp4')], {
      env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
    });
    const report = JSON.parse(stdout);
    assert.equal(report.ok, true, `B import path must upload the fixture: ${report.error}`);
    const fixture = path.join(native, 'fixtures/media/seek-360p30.mp4');
    const { stdout: probe } = await promisify(execFile)('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fixture]);
    const durationMs = Math.round(Number(probe.trim()) * 1000);
    assert.equal(Math.round(report.probedAsset.duration * 1000), durationMs,
      'video without duration must probe its real length before placement');
    assert.equal(report.probedDrop.clips.length, 2);
    for (const clip of report.probedDrop.clips) {
      assert.equal(clip.durationMs, durationMs, 'both dropped clips must use the probed span');
    }
    console.log(`PASS: missing duration probed before drop, both clips span ${durationMs} ms`);
    const unknownDuration = { ...report.asset };
    delete unknownDuration.duration;
    const { stdout: browserOutput } = await promisify(execFile)(process.argv[3], ['--probe-drop',
      JSON.stringify(unknownDuration), '--server', server.base, '--timeline', '00000000000000000000000000000000'], {
      env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
    });
    const browserDrop = JSON.parse(browserOutput);
    assert.equal(browserDrop.accepted, true);
    assert.equal(browserDrop.deferred, true, 'no clips or undo entry before the probe finishes');
    assert.equal(browserDrop.finished, true);
    assert.equal(browserDrop.undoCount, 1, 'probing and dropping must leave one undo command');
    assert.equal(browserDrop.undone, true);
    assert.equal(browserDrop.redone, true);
    const importedClips = browserDrop.document.clips.filter(clip => clip.id !== 'existing');
    // Overwrite can split the existing clip. Select the imported pair by
    // asset identity and placeholder status rather than a fresh native id.
    const video = importedClips.find(clip => clip.currentAssetId === report.asset.id);
    const audio = importedClips.find(clip => clip.status === 'generating');
    assert.equal(video.durationMs, durationMs);
    assert.equal(audio.durationMs, durationMs);
    assert.equal(video.linkId, audio.linkId);
    console.log('PASS: browser probes before overwrite placement, linked span and one-step undo/redo preserved');
    const id = report.asset.id;
    assert.match(id, /^[a-f0-9]{32}$/);
    const listed = await session.query(server.base, 'assets.list', { content_type: 'video', page_size: 200 });
    assert.ok(listed.assets.some(asset => asset.id === id), 'imported file must appear in assets.list');
    const asset = await session.query(server.base, 'assets.get', { id });
    assert.equal(typeof asset.proxy_status, 'string', 'assets.get must report proxy status');
    if (report.proxyAvailable) {
      const ready = await session.waitProxy(server.base, id, 'ready');
      assert.ok(ready.proxy_url, 'ready proxy must have a proxy_url');
      console.log('PASS: imported asset appears in assets.list and assets.get reaches ready with proxy_url');
    } else {
      assert.match(report.proxyError, /proxies.*disabled|proxies need/i);
      console.log(`PASS: imported asset appears in assets.list. Server proxies unavailable: ${report.proxyError}`);
    }
  }
} finally {
  await session.stopServers();
  fs.rmSync(work, { recursive: true, force: true });
}
