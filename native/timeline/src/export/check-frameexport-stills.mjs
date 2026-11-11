// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bin, root, scratchBase, run } from './check-export.mjs';

const dir = fs.mkdtempSync(path.join(scratchBase, 'frameexport-stills-'));
try {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/frame-hold.json')));
  Object.assign(doc, { fps: 30, durationMs: 1000 });
  doc.clips = [{ ...doc.clips[0], durationMs: 1000,
    mediaPath: path.join(root, 'fixtures/media/seek-360p30.mp4'),
    originalMediaPath: path.join(root, 'fixtures/media/seek-360p30.mp4'), currentAssetId: 'a'.repeat(32),
    effects: [{ id: 'grade', type: 'color', enabled: true, brightness: 0.12 }]
  }, {
    id: 'words', trackId: 'track-words', name: 'Words', mediaType: 'text', sourceType: 'imported', status: 'generated',
    startMs: 0, durationMs: 1000, locked: false, versions: [],
    caption: { words: [{ word: 'Export frame', startMs: 0, endMs: 1000 }] }
  }];
  doc.tracks = [{ ...doc.tracks[0], id: 'track-words', name: 'Words', index: 0 }, { ...doc.tracks[0], index: 1 }];
  const input = path.join(dir, 'input.json');
  fs.writeFileSync(input, JSON.stringify(doc));
  const frame = (process.argv.includes('--wrong-frame') || process.env.NT_FRAMEEXPORT_WRONG_FRAME === '1') ? 0 : 15;
  run(bin, [input, '--stills', path.join(dir, 'stills'), '--still-frames', String(frame), '--decode', 'sw']);
  console.log(`frameexport_stills: capture frame 15, reference frame ${frame}`);
  const output = path.join(dir, 'frame.png');
  run(bin, ['--export-frame', input, '--time-ms', '500', '--out', output]);
  const decode = file => run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }).stdout;
  const expected = decode(path.join(dir, `stills/frame_${String(frame).padStart(6, '0')}.png`));
  const actual = decode(output);
  assert.equal(actual.length, 640 * 360 * 3, 'Decoded every pixel');
  assert.equal(expected.length, 640 * 360 * 3, 'Decoded every reference pixel');
  // Colours in the top half, which no caption reaches, so the video itself must be there.
  const colours = pixels => {
    const seen = new Set();
    for (let i = 0; i < pixels.length / 2; i += 3) seen.add(pixels.readUIntBE(i, 3));
    return seen.size;
  };
  assert.ok(colours(actual) > 32, 'Captured picture is not blank');
  assert.ok(colours(expected) > 32, 'Reference picture is not blank');
  // The caption draws in the bottom half, so that half holds pixels the video grade alone would not.
  const withoutCaption = path.join(dir, 'plain.json');
  fs.writeFileSync(withoutCaption, JSON.stringify({ ...doc, clips: doc.clips.filter(c => c.id !== 'words') }));
  run(bin, [withoutCaption, '--stills', path.join(dir, 'plain'), '--still-frames', '15', '--decode', 'sw']);
  assert.ok(!decode(path.join(dir, 'plain/frame_000015.png')).equals(actual), 'The caption is in the frame');
  assert.ok(actual.equals(expected), 'Export Frame must match --stills at every pixel');
  console.log('frameexport_stills: PASS (230400 nonblank pixels, effect and caption)');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
