// Export to Premiere Pro and Import Premiere XML against a real scratch server
// (never port 7777): the transfer downloads the zip the route builds, the saved
// file is checked entry by entry, and the same zip goes back through the import
// route. Skips with 77 when no server can start.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { createScratchSession } from '../../scripts/scratch-server.mjs';

const native = fileURLToPath(new URL('../../', import.meta.url));
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nt-premiere-')));
const session = createScratchSession({ work, repo: path.resolve(native, '../..'), assertInWork: candidate => {
  if (!path.resolve(candidate).startsWith(work + path.sep)) { throw new Error('outside scratch folder'); }
  return candidate;
} });

// A solid-colour PNG of the sequence's size, so Premiere's Scale needs no fit.
function png(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let row = 0; row < height; row += 1) { rows[row * (width * 3 + 1)] = 0; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

let passed = false;
try {
  let server;
  try {
    server = await session.startServer('premiere', 18000 + (process.pid % 20000));
  } catch (error) {
    console.log(`SKIP: scratch server unavailable: ${error.message}`);
    if (process.env.NT_REQUIRE_SCRATCH_SERVER === '1') { throw error; }
    process.exitCode = 77;
  }
  if (server) {
    await session.assertScratch(server.base);
    const file = path.join(work, 'logo.png');
    const picture = png(640, 360);
    fs.writeFileSync(file, picture);
    const asset = await session.upload(server, file, 'image/png');
    const timelineId = await session.createTimeline(server.base, 'Premiere check', {
      fps: 30, width: 640, height: 360, durationMs: 2000,
      tracks: [{ id: 'v1', name: 'Picture', type: 'video', index: 0, visible: true, locked: false }],
      clips: [{ id: 'logo', trackId: 'v1', name: 'Logo', startMs: 0, durationMs: 2000, mediaType: 'image', sourceType: 'imported',
        currentAssetId: asset.id, status: 'generated', locked: false, versions: [], opacity: 0.5, blendMode: 'multiply' }]
    });
    const output = path.join(work, 'exported', 'Premiere_check-premiere.zip');
    fs.mkdirSync(path.dirname(output));
    const report = path.join(work, 'report.json');
    const imported = path.join(work, 'imported-id');
    const { stdout } = await promisify(execFile)(process.argv[2], ['realServer'], {
      env: { ...session.nativeEnv(server), QT_QPA_PLATFORM: 'offscreen', NT_PREMIERE_SERVER: server.base, NT_PREMIERE_TIMELINE: timelineId,
        NT_PREMIERE_OUTPUT: output, NT_PREMIERE_REPORT: report, NT_PREMIERE_IMPORTED: imported },
      timeout: 240000
    });
    console.log(stdout.trimEnd());
    assert.match(stdout, /PASS {3}: PremiereTest::realServer\(\)/, stdout);

    // The saved zip: the sequence, the picture it names and the report.
    const entries = unzipSync(new Uint8Array(fs.readFileSync(output)));
    const names = Object.keys(entries).sort();
    const media = names.find(name => name.startsWith('media/') && name.endsWith('.png'));
    assert.ok(media, `a picture under media/: ${names}`);
    assert.deepEqual(names.filter(name => name !== media), ['Premiere_check.xml', 'export-report.txt']);
    assert.deepEqual(Buffer.from(entries[media]), picture, 'the picture is the uploaded one');
    const xml = strFromU8(entries['Premiere_check.xml']);
    assert.match(xml, /<xmeml version="4">/);
    assert.match(xml, /<name>Logo<\/name>/);
    assert.ok(xml.includes(`<pathurl>${media}</pathurl>`), 'the XML names the picture by its zip path');
    assert.match(strFromU8(entries['export-report.txt']), /blend mode requires baking/);

    // What the native app showed: the count and the same notes.
    const shown = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(shown.clipsExported, 1);
    assert.ok(shown.notes.some(note => /Logo: blend mode requires baking/.test(note)), JSON.stringify(shown));
    assert.equal(shown.omitted, 0);

    // The zip went back through the import route and made a second timeline.
    const copy = await session.query(server.base, 'timeline.get', { id: fs.readFileSync(imported, 'utf8') });
    assert.notEqual(copy.id, timelineId);
    assert.equal(copy.clips.length, 1);
    assert.equal(copy.clips[0].name, 'Logo');
    assert.equal(copy.clips[0].mediaType, 'image');
    assert.notEqual(copy.clips[0].currentAssetId, asset.id, 'the import stored its own copy of the media');
    console.log('PASS: Premiere export and import against a scratch server');
    console.log('Totals: 1 passed, 0 failed, 0 skipped');
    passed = true;
  }
} finally {
  await session.stopServers();
  if (passed) { fs.rmSync(work, { recursive: true, force: true }); }
}
