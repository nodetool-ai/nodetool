import { beatAnimationDelayMs, compileClipAnimations, sampleAnimations } from '../../../../../packages/timeline/dist/animation/index.js';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const animation = { id: 'beat', enabled: true, role: 'in', preset: 'fade', durationMs: 1000, delayMs: 100, beat: { scope: 'sequence', index: 4, offsetMs: 50 } };
const delayMs = beatAnimationDelayMs(animation, { startMs: 1000 }, { bpm: 60, offsetMs: 200 });
const sample = sampleAnimations(compileClipAnimations([{ ...animation, delayMs }], 4000, { width: 1920, height: 1080 }), 2500);
const output = execFileSync(process.argv[2], ['samples'], { encoding: 'utf8' });
const matches = [...output.matchAll(/BEAT_SAMPLE\s+([\d.]+)/g)];
assert.equal(matches.length, 1);
assert.ok(Math.abs(Number(matches[0][1]) - sample.opacity) < 1e-9);
assert.throws(() => assert.ok(Math.abs(Number(matches[0][1]) + 1 - sample.opacity) < 1e-9));
const copyOutput = execFileSync(process.argv[2], ['expandedCopiesAndGroup'], { encoding: 'utf8' });
const copyMatches = [...copyOutput.matchAll(/BEAT_COPIES\s+(sequence|clip)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/g)];
assert.equal(copyMatches.length, 2);
for (const match of copyMatches) {
  const scope = match[1];
  const slide = { id: 'beat', enabled: true, role: 'in', preset: 'slide', durationMs: 1000, easing: 'linear', beat: { scope, index: 2 } };
  const expected = [0, 100, 50].map((startMs) => {
    const delayMs = beatAnimationDelayMs(slide, { startMs }, { bpm: 120, offsetMs: 0 });
    return sampleAnimations(compileClipAnimations([{ ...slide, delayMs }], 4000, { width: 1920, height: 1080 }), 750 - startMs).offsetX;
  });
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(Number(match[i + 2]) - expected[i]) < 1e-9);
  }
}

const groupMatch = copyOutput.match(/BEAT_GROUP\s+([-\d.]+)/);
assert.ok(groupMatch);
const groupSlide = { id: 'beat', enabled: true, role: 'in', preset: 'slide', durationMs: 1000, easing: 'linear', beat: { scope: 'sequence', index: 2 } };
const groupDelay = beatAnimationDelayMs(groupSlide, { startMs: 0 }, { bpm: 120, offsetMs: 0 });
const groupSample = sampleAnimations(compileClipAnimations([{ ...groupSlide, delayMs: groupDelay }], 4000, { width: 1920, height: 1080 }), 750);
assert.ok(Math.abs(Number(groupMatch[1]) - groupSample.offsetX / 960) < 1e-6);
