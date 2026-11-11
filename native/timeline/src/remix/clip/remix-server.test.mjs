import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createScratchSession } from '../../../scripts/scratch-server.mjs';

const native = fileURLToPath(new URL('../../../', import.meta.url));
const repo = path.resolve(native, '../..');
const work = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'nt-remix-server-'));
const session = createScratchSession({ work, repo, assertInWork: candidate => {
  if (!candidate.startsWith(work + path.sep)) { throw new Error('outside scratch folder'); }
  return candidate;
} });
try {
  let server;
  try {
    server = await session.startServer('remix', 18000 + (process.pid % 20000));
  } catch (error) {
    console.log(`SKIP: scratch server unavailable: ${error.message}`);
    if (process.env.NT_REQUIRE_SCRATCH_SERVER === '1') { throw error; }
    process.exitCode = 77;
  }
  if (server) {
    await session.assertScratch(server.base);
    const cache = path.join(work, 'native-cache');
    fs.mkdirSync(cache, { recursive: true });
    const { stdout } = await promisify(execFile)(process.argv[2], [server.base, cache], {
      env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen' }, timeout: 240000
    });
    const report = JSON.parse(stdout);
    assert.equal(report.ok, true, `remix server round trip: ${report.error}`);
    assert.ok(Math.abs(report.bpm - 120) < 1.5, `tempo ${report.bpm}`);
    assert.ok(Math.abs(report.frames - report.targetFrames) <= 1, `${report.frames} frames, wanted ${report.targetFrames}`);
    assert.ok(report.pieces >= 2);
    assert.notEqual(report.remixId, report.sourceId);
    assert.equal(report.contentType, 'audio/wav');
    console.log(`PASS: remix saved as a new asset, ${report.frames} of ${report.targetFrames} frames, ${report.pieces} pieces`);
  }
} finally {
  await session.stopServers();
  fs.rmSync(work, { recursive: true, force: true });
}
