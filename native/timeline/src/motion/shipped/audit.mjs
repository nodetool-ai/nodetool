import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadExample, assertPreserved } from './oracle.mjs';

export const EXPECTED_EXAMPLES = ['cadence', 'kite', 'prism', 'serein', 't-minus-30', 'tidewater', 'voltra'];
const repo = path.resolve(import.meta.dirname, '../../../../..');
export function assertCatalog(slugs) {
  assert.deepEqual([...slugs].sort(), EXPECTED_EXAMPLES, 'must inspect the complete shipped example catalog');
}
export function deferredProjection(document, frame) {
  if (frame === 450) {
    const clip = document.clips.find(item => item.id === 'S5_s4');
    assert(clip && clip.transform.rotationX === 72 && clip.transform.perspective === 700);
    const time = frame * 1000 / document.fps;
    assert(time >= clip.startMs && time < clip.startMs + clip.durationMs);
    return 'S5_s4';
  }
  return null;
}
export function auditResults(results) {
  assertCatalog(results.map(row => row.slug));
  const catalog = fs.readdirSync(path.join(repo, 'packages/base-nodes/nodetool/examples/timelines'))
    .filter(file => file.endsWith('.timeline.json')).map(file => file.slice(0, -'.timeline.json'.length));
  assertCatalog(catalog);
  const deferred = [];
  let compared = 0;
  for (const row of results) {
    assert(!row.error, `${row.slug}: render errors cannot be deferred`);
    const { document } = loadExample(row.slug);
    assert.equal(row.clips, document.clips.length, `${row.slug}: complete clip count`);
    assert.equal(row.media, document.clips.filter(clip => clip.mediaPath).length, `${row.slug}: complete original media count`);
    const total = Math.ceil(document.durationMs * document.fps / 1000);
    const frames = Array.from({ length: 8 }, (_, i) => Math.floor((i + 0.5) * total / 8));
    assert.deepEqual(row.frames, frames, `${row.slug}: original sample frames`);
    assert.deepEqual(row.pairs.map(pair => pair.frame), frames, `${row.slug}: missing, duplicate or reordered comparisons`);
    assert.equal(row.pass, row.pairs.every(pair => pair.pass === true), `${row.slug}: raw verdict must agree with the recorded comparisons`);
    for (const pair of row.pairs) {
      const value = pair.psnr === 'inf' ? Infinity : pair.psnr;
      assert(typeof value === 'number' && !Number.isNaN(value) && value >= 0, 'every comparison must retain a PSNR measurement');
      assert.equal(pair.pass, value >= 40, 'every pair must retain the original 40 dB verdict');
      const clipId = row.slug === 'prism' ? deferredProjection(document, pair.frame) : null;
      if (clipId) {
        deferred.push({ slug: row.slug, frame: pair.frame, clipId, psnr: pair.psnr, pass: pair.pass });
        continue;
      }
      assert(value >= 40 && pair.pass === true,
        `${row.slug} frame ${pair.frame}: non-deferred comparison failed at ${pair.psnr} dB`);
      ++compared;
    }
  }
  assert.equal(compared, 55);
  assert.equal(deferred.length, 1);
  return { nonDeferredPass: true, nonDeferredPairs: compared, deferred, fullOraclePass: results.every(row => row.pass) };
}
export function auditReport(report) {
  assert.match(report.binarySha256, /^[0-9a-f]{64}$/);
  const audit = auditResults(report.results);
  for (const row of report.results) {
    const directory = path.join(report.run, row.slug);
    const { original } = loadExample(row.slug);
    assertPreserved(original, JSON.parse(fs.readFileSync(path.join(directory, `${row.slug}.json`))));
    for (const pair of row.pairs) {
      const name = `frame_${String(pair.frame).padStart(6, '0')}.png`;
      for (const side of ['web/stills', 'native']) {
        assert(fs.statSync(path.join(directory, side, name)).size > 0, 'must retain every compared picture');
      }
    }
  }
  return audit;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const file = path.resolve(process.argv[2]);
  const before = fs.readFileSync(file);
  const report = JSON.parse(before);
  console.log(JSON.stringify({ sourceReportSha256: createHash('sha256').update(before).digest('hex'), ...auditReport(report) }, null, 2));
  assert.equal(fs.readFileSync(file, 'utf8'), before.toString(), 'scope audit must preserve the raw full report');
}
