// Shared timeline samples for the native motion regression fixture.
import { compileClipAnimations, sampleAnimations, resolveAnimationLinks } from '../../../../packages/timeline/dist/animation/index.js';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandTemporalClips } from '../../../../packages/timeline/dist/render/temporal.js';

const animation = { id: 'path', enabled: true, role: 'emphasis', preset: 'followPath', durationMs: 1000,
  params: { d: 'M 0 0 L 1 0 L 1 0.5', orient: true } };
const compiled = compileClipAnimations([animation], 1000, { width: 100, height: 100 });
const sample = sampleAnimations(compiled, 500);
const clip = { id: 'source', name: 'Source', trackId: 'v', mediaType: 'shape', startMs: 0, durationMs: 1000,
  repeater: { count: 2, positionStep: { x: 10, y: 0 }, timeStepMs: 100, colorStep: { hueDegrees: 200, brightness: 0.6 } },
  temporalEcho: { copies: 1, intervalMs: 50, opacityDecay: 0.5 } };
process.stdout.write(JSON.stringify({ path: { x: sample.positionX, y: sample.positionY },
  temporal: expandTemporalClips([clip]).map(({ id, name, startMs, opacity, effects }) => ({ id, name, startMs, opacity, effects })) }, null, 2) + '\n');

if (process.argv[2]) {
  const output = execFileSync(process.argv[2], ['pathOracle'], { encoding: 'utf8' });
  const matches = [...output.matchAll(/MOTION_ORACLE\s+([-\d.]+)\s+([-\d.]+)/g)];
  assert.equal(matches.length, 1, 'expected exactly one native path sample');
  const actual = matches[0].slice(1).map(Number);
  const expected = [sample.positionX, sample.positionY];
  assert.deepEqual(actual, expected);
  assert.throws(() => assert.deepEqual([actual[0] + 1, actual[1]], expected));
  const fixture = JSON.parse(readFileSync(new URL('../../fixtures/three-tracks.json', import.meta.url), 'utf8'));
  const [source, follower] = fixture.clips;
  const linkSource = { ...source, transform: { position: { x: 0, y: 25 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } };
  const linkFollower = { ...follower, animationLinks: [{ target: 'positionY', sourceClipId: source.id, source: 'positionY', offset: 10 }] };
  const linked = resolveAnimationLinks(linkFollower, follower.startMs + 1, [linkSource, linkFollower], { width: 1920, height: 1080 });
  const linkOutput = execFileSync(process.argv[2], ['linkedPositionUsesSourceAuthoredTransform'], { encoding: 'utf8' });
  const linkMatches = [...linkOutput.matchAll(/MOTION_LINK\s+([-\d.]+)/g)];
  assert.equal(linkMatches.length, 1);
  assert.equal(Number(linkMatches[0][1]), linked.positionY);
  const wiggleClip = { ...follower, animationLinks: [{ target: 'rotation', kind: 'wiggle', amplitude: 1, frequencyHz: 1, seed: 5 }] };
  const wiggle = resolveAnimationLinks(wiggleClip, follower.startMs, [wiggleClip], { width: 1920, height: 1080 }).rotation;
  const wiggleOutput = execFileSync(process.argv[2], ['wiggleUsesSteppedFollowerTime'], { encoding: 'utf8' });
  const wiggleMatches = [...wiggleOutput.matchAll(/MOTION_WIGGLE\s+([-\d.eE+]+)/g)];
  assert.equal(wiggleMatches.length, 1);
  assert.ok(Math.abs(Number(wiggleMatches[0][1]) - wiggle) < 1e-10);
  const temporalOutput = execFileSync(process.argv[2], ['repeatAndEchoKeepEffectsAndIdentity'], { encoding: 'utf8' });
  const temporalMatches = [...temporalOutput.matchAll(/MOTION_TEMPORAL\s+([-\d.]+)\s+([-\d.]+)\s+([^\r\n]+)/g)];
  assert.equal(temporalMatches.length, 1);
  const expectedCopy = expandTemporalClips([{ ...source, repeater: clip.repeater, temporalEcho: clip.temporalEcho }]).at(-1);
  assert.equal(Number(temporalMatches[0][1]), expectedCopy.effects.at(-1).hue);
  assert.equal(Number(temporalMatches[0][2]), expectedCopy.effects.at(-1).brightness);
  assert.equal(temporalMatches[0][3].trim(), expectedCopy.name);
  assert.throws(() => assert.equal(Number(temporalMatches[0][1]) + 1, expectedCopy.effects.at(-1).hue));
}
