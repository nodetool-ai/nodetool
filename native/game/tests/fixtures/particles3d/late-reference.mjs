import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(resolve('package.json'));
const { build } = require('esbuild');
const [binary, directory] = process.argv.slice(2);
assert(binary && directory, 'Usage: late-reference.mjs particle-test-binary output-directory');
await mkdir(directory, { recursive: true });
const bundle = resolve(directory, 'reference-bundle.mjs');
await build({ stdin: { contents: 'export {ParticleSimulator} from "./packages/game-renderer/src/particles/simulator.ts";export {gameParticles} from "./packages/protocol/src/game-particles.ts";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: bundle });
const { ParticleSimulator, gameParticles } = await import(bundle);
const doc = JSON.parse(await readFile('packages/game-runtime/samples/blacksite/game.json', 'utf8'));
const authored = [...doc.scenes.flatMap(s => s.entities), ...Object.values(doc.prefabs).flatMap(p => p.entities)].filter(e => e.particles);
const sources = authored.map((e, i) => ({ entityId: e.id, position: { x: i * .1, y: i * .05, z: -i * .2 }, rotation: [0, 0, 0, 1], particles: gameParticles.parse(e.particles) }));
const emitters = sources.flatMap(s => s.particles.emitters.map(e => ({ key: `${s.entityId}/${e.id}`, entityId: s.entityId, emitter: e })));
assert.equal(emitters.length, 33);
const maximumLifetime = Math.max(...emitters.map(({ emitter: e }) => typeof e.lifetime === 'number' ? e.lifetime : e.lifetime.max));
const ticks = Math.ceil(maximumLifetime * 60) + 1;
const captureTicks = Array.from({ length: ticks }, (_, i) => i + 1).filter(t => t <= 24 || t % 5 === 0 || t === ticks);
const captureSet = new Set(captureTicks);
const simulator = new ParticleSimulator({ dimension: '3d', maxSceneParticles: 8192 });
simulator.sync(sources);
const frames = [], reference = [], counts = [], maximumAge = {}, everSeen = new Set();
const makeFrame = tick => {
  for (const [i, s] of sources.entries()) {
    const angle = tick * .002;
    s.position = { x: i * .1 + tick * .001, y: i * .05, z: -i * .2 };
    s.rotation = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
  }
  const entities = sources.map(s => ({ id: s.entityId, transform: { position: [s.position.x, s.position.y, s.position.z], rotation: [...s.rotation], scale: [1, 1, 1] }, particles: s.particles }));
  return { tick, sceneId: 'scene', entities, worldTransforms: Object.fromEntries(entities.map(e => [e.id, e.transform])) };
};
frames.push(makeFrame(0));
counts.push({ tick: 0, emitters: {} });
for (let tick = 1; tick <= ticks; tick++) {
  const frame = makeFrame(tick);
  const emissions = tick === 1 ? emitters.map(({ entityId, emitter }) => ({ kind: 'particles', entityId, emitter: emitter.id, count: 8 })) : [];
  simulator.sync(sources); simulator.emit(emissions); simulator.step(1 / 60);
  frames.push({ ...frame, emissions });
  const samples = [], byEmitter = {};
  simulator.forEachParticle(p => {
    const key = `${p.entityId}/${p.emitterId}`;
    everSeen.add(key); maximumAge[key] = Math.max(maximumAge[key] ?? 0, p.life);
    byEmitter[key] = (byEmitter[key] ?? 0) + 1;
    if (captureSet.has(tick)) samples.push({ entityId: p.entityId, emitterId: p.emitterId, position: [p.x, p.y, p.z], velocity: [p.vx, p.vy, p.vz], size: p.size, rotation: p.rotation, color: [p.r, p.g, p.b], opacity: p.opacity, life: p.life });
  });
  counts.push({ tick, emitters: byEmitter });
  if (captureSet.has(tick)) reference.push({ tick, particles: samples });
}
const fixture = resolve(directory, 'late-fixture.json');
await writeFile(fixture, JSON.stringify({ frames, captureTicks }));
const actual = JSON.parse(execFileSync(binary, [fixture], { maxBuffer: 256 * 1024 * 1024 }));
if (process.env.NATIVE_PARTICLE_PARITY_NEGATIVE === '1') actual.captures[0].particles[0].position[0] += 1;
assert.deepEqual(actual.counts, counts, 'Every committed tick has identical per-emitter live counts, including births/deaths');
let maximumDelta = 0, numericComparisons = 0, samplesCompared = 0;
for (let c = 0; c < reference.length; c++) {
  assert.equal(actual.captures[c].tick, reference[c].tick);
  assert.equal(actual.captures[c].particles.length, reference[c].particles.length);
  for (let i = 0; i < reference[c].particles.length; i++) {
    samplesCompared++;
    for (const [field, value] of Object.entries(reference[c].particles[i])) {
      const other = actual.captures[c].particles[i][field];
      if (typeof value === 'string') { assert.equal(other, value); continue; }
      for (const [j, n] of (Array.isArray(value) ? value : [value]).entries()) {
        const delta = Math.abs(n - (Array.isArray(other) ? other[j] : other));
        maximumDelta = Math.max(maximumDelta, delta); numericComparisons++;
        assert(delta <= 1e-11, `${c}/${i}/${field}: numeric delta ${delta}`);
      }
    }
  }
}
assert.equal(everSeen.size, 33, 'Every authored emitter emitted live particles');
for (const key of ['dust-motes/motes', 'steam-left-3/steam', 'explosion/smoke']) assert(maximumAge[key] > .99, `${key} reaches late lifetime curves`);
const result = { ticks, seconds: ticks / 60, maximumAuthoredLifetime: maximumLifetime, emitters: emitters.length, captures: reference.length, samplesCompared, numericComparisons, maximumDelta, tolerance: 1e-11, maximumNormalizedAgeByEmitter: maximumAge, perTickEmitterCountComparisons: counts.length * emitters.length, motion: 'Moving and Y-rotating source transforms, preserving all authored world/local space definitions', emissions: 'Eight explicit particles per authored emitter on tick1, then authored rates/bursts' };
await writeFile(resolve(directory, 'late-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
