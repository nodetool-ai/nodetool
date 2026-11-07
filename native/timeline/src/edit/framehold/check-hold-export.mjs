// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bin, root, scratchBase, exportFile, run } from '../../export/check-export.mjs';

const args = process.argv.slice(2);
const fixture = args.includes('--fixture') ? path.resolve(args[args.indexOf('--fixture') + 1])
  : process.env.NT_FRAMEHOLD_FIXTURE ?? path.join(root, 'fixtures/frame-hold.json');
const dir = fs.mkdtempSync(path.join(scratchBase, 'framehold-export-'));
try {
  const doc = JSON.parse(fs.readFileSync(fixture));
  for (const clip of doc.clips) {
    if (clip.mediaPath) clip.mediaPath = path.resolve(path.dirname(fixture), clip.mediaPath);
  }
  const input = path.join(dir, 'input.json');
  fs.writeFileSync(input, JSON.stringify(doc));
  const zip = path.join(dir, 'frames.zip');
  const result = exportFile(input, zip, 'png_sequence');
  const count = Math.round(doc.durationMs * doc.fps / 1000);
  assert.equal(result.frames, count);
  const holds = doc.clips.filter(c => c.id.endsWith('hold'));
  assert.equal(holds.length, 3, 'Expected all three hold windows');
  const firsts = holds.map(c => Math.ceil(c.startMs * doc.fps / 1000));
  const stills = path.join(dir, 'stills');
  run(bin, [input, '--stills', stills, '--still-frames', firsts.join(','), '--decode', 'sw']);
  run('python3', ['-I', '-c', String.raw`
import json, subprocess, sys, zipfile
from pathlib import Path
zip_path, stills, doc_path = sys.argv[1:]
doc = json.loads(Path(doc_path).read_text())
fps = doc['fps']
with zipfile.ZipFile(zip_path) as z:
    names = [n for n in z.namelist() if n.endswith('.png')]
    count = round(doc['durationMs'] * fps / 1000)
    assert len(names) == count and count >= 60, (len(names), count)
    frames = [z.read(n) for n in names]
    def pixels(data):
        return subprocess.run(['ffmpeg', '-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0',
                               '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
                              input=data, check=True, capture_output=True).stdout
    assert len(set(frames[:15])) > 1, 'Motion frames must differ'
    inspected = 15
    for c in doc['clips']:
        if not c['id'].endswith('hold'): continue
        first = round(c['startMs'] * fps / 1000)
        end = round((c['startMs'] + c['durationMs']) * fps / 1000)
        reference = pixels((Path(stills) / f'frame_{first:06}.png').read_bytes())
        assert len(reference) > 0
        assert end - first >= 2
        assert pixels(frames[first]) == reference, f"{c['id']} frame {first} differs from --stills"
        for i in range(first, end):
            assert frames[i] == frames[first], f"{c['id']} frame {i} moved"
            inspected += 1
    assert inspected >= 60, f'Inspected only {inspected} frames'
print(f'framehold_export: PASS ({inspected} frames inspected)')
`, zip, stills, input]);
  console.log('framehold_export: PASS (60 frames, three holds, motion, stills equality)');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
