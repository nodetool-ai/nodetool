// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'frameexport-server-'));
const session = createScratchSession({ work, repo, assertInWork: candidate => {
  assert.ok(candidate.startsWith(work + path.sep));
  return candidate;
} });
try {
  let server;
  try { server = await session.startServer('frames', 18000 + process.pid % 20000); }
  catch (error) {
    console.log(`SKIP: scratch server unavailable: ${error.message}`);
    const log = path.join(work, 'frames/server.log');
    if (fs.existsSync(log)) console.log(fs.readFileSync(log, 'utf8').split('\n').slice(-15).join('\n'));
    if (process.env.NT_REQUIRE_SCRATCH_SERVER === '1') throw error;
    process.exitCode = 77;
  }
  if (server) {
    await session.assertScratch(server.base);
    const cli = async args => {
      const { stdout } = await promisify(execFile)(process.argv[2], ['--export-frame', ...args], {
        env: session.nativeEnv(server), timeout: 120000, maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    };
    const source = path.join(native, 'fixtures/media/seek-360p30.mp4');
    const input = JSON.parse(fs.readFileSync(path.join(native, 'fixtures/frame-hold.json')));
    for (const c of input.clips) c.mediaPath = source;
    delete input.projectId;
    const doc = path.join(work, 'doc.json');
    fs.writeFileSync(doc, JSON.stringify(input));
    const local = path.join(work, 'local.png');
    await cli([doc, '--time-ms', '500', '--out', local]);
    const row = JSON.parse(await cli([doc, '--time-ms', '500', '--library', '--name', ' x/y ', '--server', server.base]));
    assert.equal(row.content_type, 'image/png');
    assert.equal(row.name, 'x_y.png');
    const asset = await session.query(server.base, 'assets.get', { id: row.id });
    const bytes = Buffer.from(await (await fetch(new URL(asset.get_url, server.base))).arrayBuffer());
    assert.deepEqual(bytes, fs.readFileSync(local));
    const uploaded = await session.upload(server, source, 'video/mp4');
    await session.mutate(server.base, 'assets.ensureProxy', { id: uploaded.id });
    const proxied = await session.waitProxy(server.base, uploaded.id, 'ready');
    assert.equal(proxied.proxy_status, 'ready', 'Scratch server must produce a proxy');
    const proxy = Buffer.from(await (await fetch(new URL(proxied.proxy_url, server.base))).arrayBuffer());
    assert.notDeepEqual(proxy, fs.readFileSync(source), 'Proxy differs from original');
    const originalFrame = path.join(work, 'original.png');
    const serverFrame = path.join(work, 'server.png');
    await cli(['--source', source, '--time-ms', '500', '--out', originalFrame]);
    await cli(['--source', `asset://${uploaded.id}`, '--server', server.base, '--time-ms', '500', '--out', serverFrame]);
    assert.deepEqual(fs.readFileSync(serverFrame), fs.readFileSync(originalFrame), 'Source export fetches original variant');
    // The dialog, against the same server, with real pointer events. Only under this test does it have a Library.
    const { stdout: dialog } = await promisify(execFile)(process.argv[3], ['libraryThroughTheDialog',
      '--server', server.base, '--timeline', '0'.repeat(32), '--cache-dir', path.join(work, 'dialog-cache')], {
      env: { ...session.nativeEnv(server), QT_QUICK_BACKEND: 'software' }, timeout: 180000, maxBuffer: 16 * 1024 * 1024
    });
    assert.match(dialog, /PASS\s*:\s*TestFrameExportUi::libraryThroughTheDialog/);
    const uploadedByDialog = dialog.match(/ASSET ([0-9a-f]{32})/)?.[1];
    assert.ok(uploadedByDialog, 'The dialog uploaded an asset');
    const dialogRow = await session.query(server.base, 'assets.get', { id: uploadedByDialog });
    assert.equal(dialogRow.name, 'from the dialog.png');
    console.log('frameexport_server: PASS (upload bytes/content type/name, source original despite distinct proxy)');
  }
} finally {
  await session.stopServers();
  fs.rmSync(work, { recursive: true, force: true });
}
