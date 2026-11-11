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
const nativeCache = path.join(work, 'native-cache');
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
    const silentAsset = report.proxyAvailable
      ? await session.waitProxy(server.base, report.asset.id, 'ready') : report.asset;
    for (const hasAudio of [false, true]) {
      const source = hasAudio
        ? await session.upload(server, path.join(native, 'fixtures/media/flash-beep-720p30.mov'), 'video/quicktime')
        : silentAsset;
      for (const probe of [false, true]) {
        const input = { ...source };
        if (probe) { delete input.duration; }
        else { input.duration = hasAudio ? 2 : durationMs / 1000; }
        const { stdout: browserOutput } = await promisify(execFile)(process.argv[3], ['--probe-drop',
          JSON.stringify(input), '--server', server.base, '--timeline', '00000000000000000000000000000000', '--cache-dir', nativeCache], {
          env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
        });
        const dropped = JSON.parse(browserOutput);
        assert.equal(dropped.accepted, true);
        assert.equal(dropped.deferred, probe, 'only unknown duration defers placement');
        assert.equal(dropped.finished, true);
        assert.equal(dropped.undoCount, 1, 'settling linked audio must leave one undo command');
        assert.equal(dropped.undone, true);
        const newVideo = dropped.document.clips.find(clip => clip.currentAssetId === source.id);
        const runtimeVideo = dropped.runtime.find(clip => clip.id === newVideo.id);
        assert.equal(Object.hasOwn(newVideo, 'mediaPath'), false, 'runtime paths stay out of clip JSON');
        assert.equal(Object.hasOwn(newVideo, 'audioPath'), false, 'runtime paths stay out of clip JSON');
        assert.notEqual(runtimeVideo.mediaPath, '', 'newly dropped video runtime mediaPath must be populated');
        assert.equal(runtimeVideo.pictureExists, true,
          'newly dropped video runtime mediaPath must be an existing file');
        assert.ok(runtimeVideo.mediaPath.startsWith(nativeCache + path.sep), 'drop must use the loader cache root');
        assert.ok(runtimeVideo.audioPath.includes('/original/'), 'video sound always uses original bytes');
        if (source.proxy_status === 'ready' && source.proxy_url) {
          assert.ok(runtimeVideo.mediaPath.includes('/proxy/'), 'picture must use the ready proxy');
        }
        assert.equal(runtimeVideo.audioExists, true,
          'video runtime audioPath must use the original file');
        assert.equal(dropped.redone, true, 'redo must restore the settled drop');
        assert.deepEqual(dropped.runtimeRedone, dropped.runtime, 'redo must retain runtime paths');
        const video = dropped.document.clips.find(clip => clip.currentAssetId === source.id);
        const audio = dropped.document.clips.find(clip => clip.mediaType === 'audio');
        if (hasAudio) {
          assert.equal(audio?.status, 'generated', 'linked audio must finish generating');
          assert.ok(audio.currentAssetId && audio.currentAssetId !== source.id);
          assert.equal(audio.linkId, video.linkId);
          const extracted = await session.query(server.base, 'assets.get', { id: audio.currentAssetId });
          assert.equal(extracted.content_type, 'audio/wav');
          assert.equal(extracted.parent_id, source.id);
          assert.equal(extracted.name, source.name + ' (audio)');
          assert.ok(audio.durationMs > 0);
          assert.equal(dropped.runtime.find(clip => clip.id === audio.id).audioExists, true,
            'extracted WAV runtime audioPath must be an existing file');
        } else {
          assert.equal(audio, undefined, 'silent video must remove the audio placeholder');
          assert.equal(video.linkId, undefined, 'silent video must be unlinked');
          assert.equal(video.durationMs, durationMs);
          assert.equal(dropped.document.tracks.length, 1, 'silent settlement removes the created audio track');
        }
        console.log(`PASS: ${hasAudio ? 'audible' : 'silent'} browser drop (${probe ? 'probed' : 'immediate'}) settled, undo count 1`);
      }
    }
    const audible = await session.upload(server, path.join(native, 'fixtures/media/flash-beep-720p30.mov'), 'video/quicktime');
    for (const scenario of ['queued', 'undo', 'replace', 'switch', 'delete', 'failure', 'proxy-fallback']) {
      const input = { ...audible, duration: 2 };
      if (scenario === 'failure') { delete input.get_url; }
      if (scenario === 'proxy-fallback') {
        input.proxy_status = 'ready';
        input.proxy_url = '/api/storage/does-not-exist.mp4?v=missing';
      }
      const { stdout } = await promisify(execFile)(process.argv[3], ['--probe-drop', JSON.stringify(input), scenario,
        '--server', server.base, '--timeline', '00000000000000000000000000000000', '--cache-dir', nativeCache], {
        env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
      });
      const dropped = JSON.parse(stdout);
      assert.equal(dropped.accepted, true);
      assert.equal(dropped.finished, true);
      if (scenario === 'queued' || scenario === 'failure' || scenario === 'proxy-fallback') {
        const audio = dropped.document.clips.find(clip => clip.mediaType === 'audio');
        assert.equal(audio.status, scenario === 'failure' ? 'failed' : 'generated');
        assert.equal(dropped.undoCount, 1);
        if (scenario === 'proxy-fallback') {
          const video = dropped.document.clips.find(clip => clip.currentAssetId === audible.id);
          const runtime = dropped.runtime.find(clip => clip.id === video.id);
          assert.equal(runtime.pictureExists, true);
          assert.ok(runtime.mediaPath.includes('/original/'), 'failed proxy must fall back to original');
        }
        if (scenario === 'failure') {
          const missing = dropped.runtime.find(clip => clip.mediaPath.includes('/missing/'));
          assert.ok(missing, 'failed picture fetch must register the loader placeholder path');
          assert.equal(missing.pictureExists, false);
          assert.equal(missing.audioPath, '');
        }
      } else {
        assert.equal(dropped.unchangedAfterAction, true, `settlement must ignore ${scenario} of original document/clip`);
        if (scenario === 'undo') {
          assert.equal(dropped.redoneDocument.clips.find(clip => clip.mediaType === 'audio')?.status,
            'generated', 'settlement after undo must update the recorded drop for redo');
          const audio = dropped.redoneDocument.clips.find(clip => clip.mediaType === 'audio');
          assert.equal(dropped.runtimeRedone.find(clip => clip.id === audio.id).audioExists, true,
            'WAV registered while undone must resolve on redo');
        }
      }
      console.log(`PASS: extraction ${scenario}`);
    }
    const createAsset = async (fields, file) => {
      await session.assertScratch(server.base);
      const { stdout } = await promisify(execFile)(process.argv[2], [server.base,
        file ?? fixture, JSON.stringify(fields)], {
        env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
      });
      return JSON.parse(stdout);
    };
    const folder = await createAsset({ name: 'Footage', content_type: 'folder', parent_id: '1' });
    const nested = await createAsset({ name: 'take.mp4', content_type: 'video/mp4', parent_id: folder.id }, fixture);
    const { stdout: listing } = await promisify(execFile)(process.argv[3], ['--list-folder', folder.id,
      '--server', server.base, '--timeline', '00000000000000000000000000000000', '--cache-dir', nativeCache], {
      env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 120000
    });
    const navigation = JSON.parse(listing);
    assert.equal(navigation.folder, folder.id);
    assert.equal(navigation.home, '');
    assert.deepEqual(navigation.assets.map(asset => asset.id), [nested.id]);
    assert.ok(navigation.homeAssets.some(asset => asset.id === folder.id));
    assert.ok(!navigation.homeAssets.some(asset => asset.id === nested.id));
    console.log('PASS: browser enters folder, lists uploaded child and returns home');
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
