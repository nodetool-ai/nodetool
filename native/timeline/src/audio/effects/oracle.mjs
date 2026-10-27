// P1: real renderAudio.ts -> AudioGraph -> audioEffectNodes, using
// node-web-audio-api 1.0.9. Maximum absolute error limits:
// gain 1e-6, eq3 1e-5, filter 1e-6, echo 1e-6, reverb 2e-6,
// compressor 1e-5, distortion 3e-5, multi-effect chain 1e-5.
// Compressor and distortion also require relative RMS error <= -100 dB.
// Their lookahead/envelope and 2x resampling filters are implementation-defined.
// We use the reference engine's compression curve and BlackmanHarris2 kernels.
// No latency alignment or gain fitting is performed.
// Every sample is checked, including silence and tails. Nothing is aligned,
// discarded, normalized or rescaled to improve a comparison.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import * as webAudio from 'node-web-audio-api';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const binary = path.resolve(process.argv[2]);
const work = path.join(path.dirname(binary), 'p1-oracle', String(process.pid));
fs.mkdirSync(work, { recursive: true });
Object.assign(globalThis, webAudio);

// Only out-of-scope MIDI/worklet/browser host imports are stubbed. The render,
// graph, effect nodes, fades, clip selection and IR generator are real web code.
await build({
  entryPoints: [path.join(root, 'web/src/components/timeline/render/renderAudio.ts')],
  outfile: path.join(work, 'web-render.mjs'), bundle: true, platform: 'node', format: 'esm',
  alias: { '@nodetool-ai/timeline': path.join(root, 'packages/timeline/src/index.ts') },
  plugins: [{ name: 'no-instruments', setup(b) {
    b.onResolve({ filter: /(?:fableFxUnit|samplerAudio|vstRender|registerFablesynthDevices|liveDevice)$/ }, args =>
      ({ path: args.path, namespace: 'out-of-scope' }));
    b.onLoad({ filter: /.*/, namespace: 'out-of-scope' }, () => ({ contents: `
      export const liveDeviceFactory = () => undefined;
      export const usesFableFx = () => false;
      export const preloadFableFx = async () => {};
      export const buildFableFxNodes = () => { throw Error('fable out of scope'); };
      export const disposeFableFxNodes = () => {};
      export const getSamplerAudio = () => { throw Error('MIDI out of scope'); };
      export const renderVstBuffer = () => { throw Error('VST out of scope'); };
    ` }));
  } }]
});
const { renderTimelineAudio } = await import(pathToFileURL(path.join(work, 'web-render.mjs')));

function wav(samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 4);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(3, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 8, 28);
  out.writeUInt16LE(8, 32); out.writeUInt16LE(32, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 4, 40);
  for (let i = 0; i < samples.length; ++i) { out.writeFloatLE(samples[i], 44 + 4 * i); }
  return out;
}
const rate = 48000;
const tolerances = {gain:1e-6, eq3:1e-5, filter:1e-6, echo:1e-6, reverb:2e-6, compressor:1e-5, distortion:3e-5, chain:1e-5};
const source = new Float32Array(rate * 2);
for (let i = 0; i < rate; ++i) {
  source[2 * i] = 0.3 * Math.sin(i * 2 * Math.PI * 227 / rate);
  source[2 * i + 1] = 0.23 * Math.sin(i * 2 * Math.PI * 733 / rate);
  if (i > 16000 && i < 32000) { source[2*i] *= 3; source[2*i+1] *= 3; }
  if (i > 36000 && i < 40000) { source[2*i] += .15 * Math.sin(i*i*1.2345); source[2*i+1] -= .1 * Math.cos(i*i*.6789); }
  if (i < 512 || i > 45000) { source[2*i] = 0; source[2*i+1] = 0; }
  if (i === 128) { source[2*i] = .8; source[2*i+1] = -.5; }
}
// A small initial stereo impulse supplements the later loud passage and noise.
source[0] = .05; source[1] = -.03;
const audio = wav(source, rate);
let activeAudio = audio;
const mediaPath = path.join(work, 'source.wav');
fs.writeFileSync(mediaPath, audio);
globalThis.fetch = async url => {
  if (url !== 'p1:source') { throw Error(`Unexpected fetch ${url}`); }
  return new Response(activeAudio);
};
const effect = (type, params) => ({ id: type, type, enabled: true, ...params });
const defaults = {
 gain: {gainDb:-12},
 eq3: {lowFreq:200,lowGainDb:6,midFreq:1000,midQ:1,midGainDb:-4,highFreq:5000,highGainDb:3},
 filter: {mode:'lowpass',frequency:1800,q:1},
 compressor: {thresholdDb:-24,ratio:4,attackMs:3,releaseMs:250,kneeDb:12},
 echo: {delayMs:125,feedback:.4,mix:.5},
 reverb: {decaySec:.3,mix:.5},
 distortion: {driveDb:12,outputDb:-6}
};
const cases = [];
function add(type, name, params = {}, extra = {}) {
 cases.push({ name: `${type}-${name}`, type, effects:[effect(type,{...defaults[type],...params})], ...extra });
}
for (const type of Object.keys(defaults)) {
 add(type,'clip'); add(type,'track',{}, {location:'track'}); add(type,'master',{}, {location:'master'});
}
for (const gainDb of [-24,0,24]) add('gain',String(gainDb),{gainDb});
add('eq3','low-edge',{lowFreq:20,lowGainDb:-18,midFreq:200,midQ:.1,midGainDb:18,highFreq:1000,highGainDb:-18});
add('eq3','high-edge',{lowFreq:1000,lowGainDb:18,midFreq:8000,midQ:10,midGainDb:-18,highFreq:16000,highGainDb:18});
add('eq3','neutral',{lowGainDb:0,midGainDb:0,highGainDb:0});
for (const mode of ['lowpass','highpass','bandpass']) {
 add('filter',`${mode}-low`,{mode,frequency:20,q:.1});
 add('filter',`${mode}-high`,{mode,frequency:20000,q:20});
}
add('filter','zero',{frequency:0}); add('filter','nyquist',{frequency:48000});
add('compressor','hard',{thresholdDb:-60,ratio:20,attackMs:0,releaseMs:0,kneeDb:0});
add('compressor','neutral',{thresholdDb:0,ratio:1,attackMs:500,releaseMs:2000,kneeDb:40});
add('compressor','soft',{thresholdDb:-35,ratio:12,attackMs:50,releaseMs:80,kneeDb:40});
add('echo','min',{delayMs:1,feedback:0,mix:1});
add('echo','knob-min',{delayMs:10,feedback:.95,mix:1});
add('echo','fractional',{delayMs:11.3,feedback:.2,mix:.3});
add('echo','max',{delayMs:5000,feedback:.95,mix:1},{durationMs:6200,mono:true});
add('echo','dry',{delayMs:2000,feedback:0,mix:0});
add('reverb','min',{decaySec:.05,mix:1});
add('reverb','knob-min',{decaySec:.1,mix:0});
add('reverb','knob-max',{decaySec:10,mix:.5});
add('reverb','max',{decaySec:20,mix:1},{durationMs:21200});
for (const [driveDb,outputDb] of [[0,0],[40,-24],[60,-60],[0,24],[12,12]]) add('distortion',`${driveDb}-${outputDb}`,{driveDb,outputDb});
cases.push({ name:'chain', type:'chain', durationMs:2600, effects:['gain','eq3','filter','echo','reverb'].map(type=>effect(type,defaults[type])) });
cases.push({ name:'disabled-and-unsupported', type:'gain', effects:[{...effect('gain',{gainDb:24}), enabled:false},{...effect('fable',{}),enabled:false},effect('videoBlur',{}),effect('gain',{gainDb:-12})] });
cases.push({name:'overlapping-track-compressor',type:'compressor',effects:[effect('compressor',defaults.compressor)],location:'track',
 configure(doc) { doc.clips[0].volumeDb = -6; doc.clips.push({...structuredClone(doc.clips[0]), id:'second',startMs:37,durationMs:650,inPointMs:0,volumeDb:-3}); }});
cases.push({name:'video-own-audio',type:'gain',effects:[effect('gain',{gainDb:-12})],
 configure(doc) { doc.tracks[0].type='video'; doc.tracks[0].effects=[effect('gain',{gainDb:24})]; doc.clips[0].mediaType='video'; }});
for (const type of ['distortion','compressor','echo','reverb']) {
 add(type,'abrupt-end',{}, {clipDurationMs:750});
}
for (const delayMs of [1,10]) {
 cases.push({name:`echo-distortion-${delayMs}`,type:'distortion',clipDurationMs:delayMs===1?1:20,
  effects:[effect('echo',{delayMs,feedback:delayMs===1?.8:.2,mix:1}),effect('distortion',defaults.distortion)]});
}
cases.push({name:'echo-gap',type:'echo',clipDurationMs:20,mono:true,effects:[effect('echo',{delayMs:10,feedback:0,mix:1})]});
let compared = 0;
const maxima = {};
let passed = true;
for (const test of cases.filter(test => !process.env.P1_CASE || test.name.includes(process.env.P1_CASE))) {
  // This engine can downmix max-delay and short-clip feedback tails to mono.
  // Use identical channels in those cases. Other echo cases stay stereo,
  // and tst_audioeffects independently checks stereo at the maximum delay.
  if (test.mono) {
    const mono = source.slice();
    for (let i=0;i<rate;++i) mono[2*i+1] = mono[2*i];
    activeAudio = wav(mono, rate);
  } else { activeAudio = audio; }
  fs.writeFileSync(mediaPath,activeAudio);
  const doc = {
    name: test.name, fps: 30, width: 64, height: 64, durationMs: test.durationMs ?? 1400,
    tracks: [{ id: 'track', name: 'Audio', type: 'audio', index: 0, visible: true, locked: false }],
    clips: [{ id: 'clip', trackId: 'track', mediaType: 'audio', status: 'generated', startMs: 0,
      durationMs: 1000, inPointMs: 0, currentAssetId: 'source', mediaPath, audioEffects: test.location ? [] : test.effects }],
    master: { volumeDb: 0 }
  };
  if (test.location === 'track') { doc.tracks[0].effects = test.effects; }
  if (test.location === 'master') { doc.master.effects = test.effects; }
  test.configure?.(doc);
  if (test.clipDurationMs) { doc.clips[0].durationMs = test.clipDurationMs; }
  const ref = await renderTimelineAudio({ ...doc, sampleRate: rate, resolveUrl: async () => 'p1:source' });
  if (!ref) { throw Error('Web render returned no audio'); }
  const nativeDoc = structuredClone(doc);
  if (process.argv.includes('--disable-native')) { nativeDoc.clips[0].audioEffects = []; nativeDoc.tracks[0].effects = []; nativeDoc.master.effects = []; }
  const fixture = path.join(work, `${test.name}.json`);
  const output = path.join(work, `${test.name}.f32`);
  fs.writeFileSync(fixture, JSON.stringify(nativeDoc));
  execFileSync(binary, [fixture, output, String(rate)], { env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } });
  const bytes = fs.readFileSync(output);
  if (bytes.length !== ref.length * 8) { throw Error('Length mismatch'); }
  // The Node binding copies a channel on getChannelData. Cache each one once
  // so sample comparison stays linear for long delay and reverb fixtures.
  const channels = [ref.getChannelData(0), ref.getChannelData(1)];
  const referenceBytes = Buffer.alloc(ref.length * 8);
  for (let i=0; i<ref.length; ++i) for (let c=0;c<2;++c) referenceBytes.writeFloatLE(channels[c][i],(2*i+c)*4);
  fs.writeFileSync(path.join(work, `${test.name}.web.f32`),referenceBytes);
  let max = 0, maxFrame = 0, energy = 0, errorEnergy = 0;
  for (let i = 0; i < ref.length; ++i) {
    for (let c = 0; c < 2; ++c) {
      const a = bytes.readFloatLE((2 * i + c) * 4), b = channels[c][i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { throw Error('Non-finite sample'); }
      if (Math.abs(a-b) > max) { max = Math.abs(a-b); maxFrame = i; } energy += b * b; errorEnergy += (a - b) ** 2;
    }
  }
  const relativeRmsDb = errorEnergy === 0 ? -Infinity : 10 * Math.log10(errorEnergy / energy);
  const pass = max <= tolerances[test.type] && (energy > 1e-10 || test.name === 'filter-zero') && (!['compressor','distortion'].includes(test.type) || relativeRmsDb <= -100);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${test.name}: max=${max} frame=${maxFrame} relativeRmsDb=${relativeRmsDb}`);
  passed &&= pass; compared += energy;
  maxima[test.type] = Math.max(maxima[test.type] ?? 0, max);
}
if (!(compared > 0)) { throw Error('No non-silent audio compared'); }
console.log(`Measured maxima: ${JSON.stringify(maxima)}`);
fs.writeFileSync(path.join(work, 'maxima.json'), JSON.stringify(maxima, null, 2));
process.exitCode = passed ? 0 : 1;
