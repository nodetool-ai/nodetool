import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { importGolden } from '../shipped/oracle.mjs';
import { assertImportedTreatments } from '../pixels/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

export function placementDocument() {
  const shared = { startMs: 0, durationMs: 1000, sourceType: 'imported', status: 'generated', locked: false, versions: [] };
  return {
    id: 'straight-placement', projectId: 'fixtures', name: 'Straight alpha placement', fps: 30, width: 320, height: 180, durationMs: 1000,
    markers: [], createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z',
    tracks: [{ id: 'picture', name: 'Picture', type: 'video', index: 0, visible: true, locked: false },
      { id: 'background', name: 'Background', type: 'video', index: 1, visible: true, locked: false }],
    clips: [{ ...shared, id: 'picture', name: 'Keyed full-chroma pixels', trackId: 'picture', mediaType: 'image', width: 64, height: 64,
      currentAssetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', mediaPath: path.join(import.meta.dirname, 'fixtures/chroma-444.jpg'),
      transform: { position: { x: 0.25, y: -0.375 }, scale: { x: 0.95, y: 0.95 }, rotation: 1.2, anchor: { x: 0.5, y: 0.5 } },
      effects: [{ id: 'key', type: 'chromaKey', enabled: true, color: '#dc2d46', tolerance: 0.2, softness: 0.1, spill: 0 },
        { id: 'edge', type: 'stylize', enabled: true, mode: 'edgeHighlight', amount: 1.4, scale: 5, color: '#22e1ff' }] },
    { ...shared, id: 'background', name: 'Purple', trackId: 'background', mediaType: 'shape',
      shapeStyle: { kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#8030a0' } }]
  };
}
export function placementCases() {
  const base = placementDocument();
  const grouped = structuredClone(base);
  grouped.clips[0].parentId = 'group';
  grouped.clips.push({ id: 'group', name: 'Grouped keyed leaf', trackId: 'picture', mediaType: 'group',
    startMs: 0, durationMs: 1000, sourceType: 'imported', status: 'generated', locked: false, versions: [], opacity: 0.65,
    transform: { position: { x: 3.25, y: -2.125 }, scale: { x: 0.9, y: 0.9 }, rotation: -3, anchor: { x: 0.5, y: 0.5 } } });
  const luma = structuredClone(base);
  luma.clips[0].matte = { mode: 'luma', sourceClipId: 'colored-matte' };
  luma.clips.push({ ...structuredClone(luma.clips[1]), id: 'colored-matte', name: 'Colored low-alpha luma',
    trackId: 'picture', opacity: 0.7,
    shapeStyle: { kind: 'rect', x: 0.1, y: 0.1, width: 0.8, height: 0.8,
      fillStyle: { type: 'linear', angle: 40, stops: [{ offset: 0, color: 'rgba(255,0,0,0.3)' }, { offset: 1, color: 'rgba(0,40,255,0.8)' }] } } });
  const cropped = structuredClone(base);
  cropped.clips[0].crop = { left: 0.125, right: 0.125, top: 0.125, bottom: 0.125 };
  cropped.clips[0].borderRadius = 6;
  cropped.clips[0].effects.push({ id: 'shadow', type: 'dropShadow', enabled: true, offsetX: 8, offsetY: 12, blur: 10, color: 'rgba(0,0,0,0.5)' });
  const noRadius = structuredClone(cropped);
  delete noRadius.clips[0].borderRadius;
  const fractionalQuarter = structuredClone(cropped);
  const fractionalThreeQuarter = structuredClone(noRadius);
  for (const [document, x, y] of [[fractionalQuarter, 8.25, 12.75], [fractionalThreeQuarter, 8.75, 12.25]]) {
    const shadow = document.clips[0].effects.find(effect => effect.type === 'dropShadow');
    Object.assign(shadow, { offsetX: x, offsetY: y, opacity: 0.55 });
  }
  return [{ name: 'scaled-keyed', document: base }, { name: 'grouped-keyed', document: grouped },
    { name: 'colored-luma', document: luma }, { name: 'cropped-outset', document: cropped },
    { name: 'cropped-outset-no-radius', document: noRadius },
    { name: 'cropped-fractional-quarter', document: fractionalQuarter },
    { name: 'cropped-fractional-threequarter', document: fractionalThreeQuarter }];
}
export function main(argv) {
  assert(argv[0], 'immutable native executable is required');
  const binary = path.resolve(argv[0]);
  const hash = () => createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  const binarySha256 = hash();
  const directory = fs.mkdtempSync(path.resolve(import.meta.dirname, '../../../build/motion-placement-'));
  const results = [];
  const cases = placementCases();
  assert.equal(cases.length, 7, 'must inspect every placement boundary');
  if (argv.includes('--causal')) {
    const crop = cases.find(row => row.name === 'cropped-outset').document;
    for (const mode of ['no-shadow', 'no-edge', 'shadow-zero-blur']) {
      const document = structuredClone(crop);
      if (mode === 'shadow-zero-blur') {
        document.clips[0].effects.find(effect => effect.type === 'dropShadow').blur = 0;
      } else {
        for (const effect of document.clips[0].effects) {
          if ((mode === 'no-shadow' && effect.type === 'dropShadow') || (mode === 'no-edge' && effect.mode === 'edgeHighlight')) {
            effect.enabled = false;
          }
        }
      }
      cases.push({ name: `crop-${mode}`, document });
    }
  }
  for (const row of cases) {
    const run = path.join(directory, row.name);
    fs.mkdirSync(run);
    const file = path.join(run, 'placement.json');
    const before = JSON.stringify(row.document);
    fs.writeFileSync(file, before);
    importGolden(file, [0], path.join(run, 'web'), run);
    assertImportedTreatments(row.document, JSON.parse(fs.readFileSync(path.join(run, 'web/placement.imported.json'))));
    assert.equal(hash(), binarySha256);
    execFileSync(binary, [file, '--stills', path.join(run, 'native'), '--still-frames', '0', '--decode', 'sw'], { stdio: 'pipe', timeout: 90000 });
    assert.equal(hash(), binarySha256);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    results.push({ name: row.name, ...comparePairs([0], path.join(run, 'web/stills'), path.join(run, 'native'), 40) });
  }
  const report = { binary, binarySha256, directory, results };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return results.every(row => row.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
