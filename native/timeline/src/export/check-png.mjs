#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, scratchBase, exportFile, run } from './check-export.mjs';

const dir = fs.mkdtempSync(path.join(scratchBase, 'nt-export-png-'));
try {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/av-sync.json')));
  Object.assign(doc, { width: 64, height: 48, fps: 3, durationMs: 1000 });
  Object.assign(doc.clips[0], { startMs: 0, durationMs: 1000, inPointMs: 0,
    mediaPath: path.join(root, 'fixtures', doc.clips[0].mediaPath) });
  const fixture = path.join(dir, 'short.json');
  fs.writeFileSync(fixture, JSON.stringify(doc));
  const archive = path.join(dir, 'sequence.zip');
  const result = exportFile(fixture, archive, 'png_sequence');
  assert.equal(result.frames, 3);
  run('python3', ['-I', '-c', String.raw`
import json, struct, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None, 'ZIP CRC validation failed'
    names = ['frame_000001.png', 'frame_000002.png', 'frame_000003.png', 'manifest.json']
    assert archive.namelist() == names, archive.namelist()
    assert all(entry.compress_type == zipfile.ZIP_STORED for entry in archive.infolist())
    manifest = json.loads(archive.read('manifest.json'))
    assert manifest == dict(format='png_sequence', fps=3, width=64, height=48,
                            count=3, pattern='frame_%06d.png'), manifest
    assert len(names) - 1 == manifest['count']
    png = archive.read(names[0])
    assert png[:8] == b'\x89PNG\r\n\x1a\n' and png[12:16] == b'IHDR'
    assert struct.unpack('>II', png[16:24]) == (64, 48)
`, archive]);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['sequence.zip', 'short.json']);
  console.log('export_png: PASS (stored ZIP, CRCs, frame names, manifest, PNG dimensions)');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
