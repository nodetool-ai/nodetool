// The music oracle (docs/MUSIC-MODE.md MD12, MM1 exits 2 and 3): the C++ port
// in src/music/ against packages/timeline/src/music/ on the same requests.
// NT_MUSIC_ORACLE names the nt_music_oracle binary.
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import {
  barStartFrame, beatLengthFrames, beatStartFrame, frameToMs, gridLineAtOrAfter, gridLineAtOrBefore, msToFrame,
  snapFrameToGrid, type MusicTempo
} from '../../../../packages/timeline/src/music/frames';
import { planMusicOperation, type MusicPlanClip, type MusicPlanInput, type MusicPlanTrack } from '../../../../packages/timeline/src/music/plan';
import { MUSIC_ROLES, musicRoleLabel } from '../../../../packages/timeline/src/music/roles';
import { isTempoLocked, musicTempoRefusal, tempoChangeRefusal } from '../../../../packages/timeline/src/music/tempoRules';
import type { TimelineTempo } from '../../../../packages/timeline/src/types';

const barRange = (from: number, to: number, tempo: MusicTempo): number[] => {
  const frames: number[] = [];
  for (let bar = from; bar <= to; bar += 1) frames.push(barStartFrame(bar, tempo));
  return frames;
};
const functions = { barStartFrame, barStartFrameRange: barRange, beatStartFrame, beatLengthFrames, frameToMs, msToFrame,
  gridLineAtOrBefore, gridLineAtOrAfter, snapFrameToGrid, planMusicOperation, musicTempoRefusal, isTempoLocked,
  tempoChangeRefusal, musicRoleLabel };
type Request = { fn: keyof typeof functions; args: unknown[] };

function web(request: Request): unknown {
  try {
    return Reflect.apply(functions[request.fn], undefined, request.args);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: error.message };
  }
}

let compared = 0;
afterAll(() => console.info(`Music oracle: ${compared} requests compared`));

function compare(requests: Request[]): unknown[] {
  compared += requests.length;
  const binary = process.env.NT_MUSIC_ORACLE;
  if (!binary) throw new Error('NT_MUSIC_ORACLE is required');
  const directory = mkdtempSync(path.join(tmpdir(), 'music-oracle-'));
  const inputFile = path.join(directory, 'requests.json');
  writeFileSync(inputFile, JSON.stringify(requests));
  const input = openSync(inputFile, 'r');
  let actual: unknown[];
  try {
    // A file descriptor avoids the sandbox's hanging synchronous stdin socket.
    actual = JSON.parse(execFileSync(binary, [], {
      stdio: [input, 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60000
    })) as unknown[];
  } finally {
    closeSync(input);
    rmSync(directory, { recursive: true, force: true });
  }
  expect(actual).toHaveLength(requests.length);
  requests.forEach((request, i) => expect(actual[i], JSON.stringify(request).slice(0, 2000)).toEqual(JSON.parse(JSON.stringify(web(request)))));
  return actual;
}

const tempo = (bpm: number, beatsPerBar = 4, beatUnit = 4, offsetMs = 0): TimelineTempo =>
  ({ bpm, offsetMs, timeSignature: { beatsPerBar, beatUnit } });

it('barStartFrame equals the TypeScript for bars 1 to 10000 at 87, 120 and 173 BPM in 3/4, 4/4 and 6/8 (MM1 exit 2)', () => {
  const requests: Request[] = [];
  for (const bpm of [87, 120, 173]) {
    for (const [b, u] of [[3, 4], [4, 4], [6, 8]]) requests.push({ fn: 'barStartFrameRange', args: [1, 10000, tempo(bpm, b, u)] });
  }
  const answers = compare(requests) as number[][];
  // Every answer holds 10000 frames: the comparison covered the whole range.
  expect(answers.map((a) => a.length)).toEqual(Array(9).fill(10000));
});

it('beats, conversions, grid lines and snapping agree, including the errors', () => {
  const requests: Request[] = [];
  const tempi = [tempo(87, 3, 4, 17), tempo(120), tempo(173, 6, 8), tempo(140, 2, 4, 1000), tempo(97.3, 7, 8, 333.3)];
  for (const t of tempi) {
    requests.push({ fn: 'beatLengthFrames', args: [t] });
    for (const n of [-4, 0, 1, 2, 17, 999, 40001]) {
      requests.push({ fn: 'barStartFrame', args: [n, t] }, { fn: 'beatStartFrame', args: [n, t] });
    }
    for (const frame of [0, 1, 11999, 12000, 47999, 48000, 48001, 95999, 96000, 1234567, 48000 * 599]) {
      for (const division of ['bar', 'beat']) {
        requests.push({ fn: 'gridLineAtOrBefore', args: [frame, t, division] }, { fn: 'gridLineAtOrAfter', args: [frame, t, division] },
          { fn: 'snapFrameToGrid', args: [frame, t, division] });
      }
    }
  }
  for (const frame of [0, 1, 47, 48, 96000, 28799999]) requests.push({ fn: 'frameToMs', args: [frame] });
  for (const ms of [0, 0.0104, 0.0105, 1000, 1000 / 3, 16000.5]) requests.push({ fn: 'msToFrame', args: [ms] });
  for (const bad of [tempo(0), tempo(-1), tempo(Number.NaN), tempo(120, 0), tempo(120, 4, 0), tempo(120, 4, 4, Number.NaN)]) {
    requests.push({ fn: 'barStartFrame', args: [1, bad] }, { fn: 'beatLengthFrames', args: [bad] });
  }
  compare(requests);
});

it('tempo rules agree (MD6, MD9)', () => {
  const requests: Request[] = [];
  for (const bpm of [29, 30, 87, 87.5, 300, 301, Number.NaN]) {
    for (const [b, u] of [[2, 4], [3, 4], [4, 4], [6, 8], [5, 4], [6, 4], [3, 8]]) requests.push({ fn: 'musicTempoRefusal', args: [tempo(bpm, b, u)] });
  }
  const audio = { mediaType: 'audio' };
  const video = { mediaType: 'video' };
  const sequences = [
    { clips: [] }, { clips: [video] }, { clips: [video, audio] }, { tempo: tempo(120), clips: [audio] },
    { tempo: tempo(90, 3, 4, 50), music: {}, clips: [] }, { tempo: tempo(120), music: { promptHistory: ['a'] }, clips: [audio] }
  ];
  const nexts = [tempo(120), tempo(121), tempo(90, 3, 4, 50), tempo(87.5), tempo(120, 5, 4), tempo(120, 4, 4, 10),
    { ...tempo(120), key: { tonic: 'A', mode: 'minor' } }];
  for (const sequence of sequences) {
    requests.push({ fn: 'isTempoLocked', args: [sequence] });
    for (const next of nexts) requests.push({ fn: 'tempoChangeRefusal', args: [sequence, next] });
  }
  for (const role of MUSIC_ROLES) requests.push({ fn: 'musicRoleLabel', args: [role] });
  compare(requests);
});

const frameMs = (frame: number): number => frameToMs(frame);
const audioTrack = (id: string, patch: Partial<MusicPlanTrack> = {}): MusicPlanTrack => ({ id, type: 'audio', ...patch });
const audioClip = (id: string, trackId: string, start: number, end: number, patch: Partial<MusicPlanClip> = {}): MusicPlanClip =>
  ({ id, trackId, startMs: frameMs(start), durationMs: frameMs(end - start), mediaType: 'audio', currentAssetId: `asset-${id}`,
    status: 'generated', ...patch });

it('the planner agrees on the four rows of the inference table (MM1 exit 3)', () => {
  const t = tempo(120);
  const bar = (n: number): number => barStartFrame(n, t);
  const tracks = [audioTrack('bass', { musicRole: 'bass' }), audioTrack('drums', { musicRole: 'drums' })];
  const bassClip = audioClip('b', 'bass', bar(1), bar(9));
  const drums = audioClip('d', 'drums', bar(1), bar(9));
  const rows: MusicPlanInput[] = [
    { tempo: t, tracks, clips: [bassClip, drums], selection: { trackId: 'bass', startFrame: bar(3), endFrame: bar(5) } },
    { tempo: t, tracks, clips: [drums], selection: { trackId: 'bass', startFrame: bar(3), endFrame: bar(5) } },
    { tempo: t, tracks, clips: [], selection: { trackId: 'bass', startFrame: bar(3), endFrame: bar(5) } },
    { tempo: t, tracks, clips: [bassClip], selection: { trackId: 'bass', startFrame: bar(7), endFrame: bar(11) } }
  ];
  const answers = compare(rows.map((row) => ({ fn: 'planMusicOperation', args: [row] }))) as Array<{ inferred: string | null }>;
  expect(answers.map((a) => a.inferred)).toEqual(['repaint', 'lego', 'text2music', null]);
});

it('the planner hears only the clips the mixer plays', () => {
  const t = tempo(120);
  const bar = (n: number): number => barStartFrame(n, t);
  const tracks = [audioTrack('bass', { musicRole: 'bass' }), audioTrack('drums', { musicRole: 'drums' })];
  const selection = { trackId: 'bass', startFrame: bar(3), endFrame: bar(5) };
  const rows: MusicPlanInput[] = [];
  for (const status of ['generated', 'stale', 'locked', 'generating', 'queued', 'failed', 'draft', 'missing', undefined] as const) {
    rows.push({ tempo: t, tracks, clips: [audioClip('d', 'drums', bar(1), bar(9), { status })], selection });
  }
  rows.push({ tempo: t, tracks, clips: [audioClip('d', 'drums', bar(1), bar(9), { currentAssetId: undefined })], selection });
  rows.push({ tempo: t, tracks, clips: [audioClip('d', 'drums', bar(1), bar(9), { status: 'queued' })], selection, operation: 'lego' });
  for (const type of ['midi', 'video'] as const) {
    rows.push({ tempo: t, tracks: [tracks[0]!, audioTrack('drums', { type })], clips: [audioClip('d', 'drums', bar(1), bar(9))], selection });
  }
  const answers = compare(rows.map((row) => ({ fn: 'planMusicOperation', args: [row] }))) as Array<{ inferred: string | null; refusal?: string }>;
  expect(answers.map((a) => a.inferred)).toEqual(['lego', 'lego', 'lego', 'lego', 'text2music', 'text2music', 'text2music', 'text2music',
    'text2music', 'text2music', 'text2music', 'lego', 'text2music']);
  expect(answers[10]!.refusal).toBe('no_context');
});

it('the planner agrees on 200 seeded cases (MM1 exit 3)', () => {
  let seed = 4711;
  const random = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const cases: MusicPlanInput[] = [];
  for (let n = 0; n < 200; n += 1) {
    const [beatsPerBar, beatUnit] = random() < 0.9 ? pick([[2, 4], [3, 4], [4, 4], [6, 8]]) : pick([[5, 4], [7, 8]]);
    const bpm = random() < 0.9 ? 30 + Math.floor(random() * 271) : pick([87.5, 29, 301]);
    const t: TimelineTempo = { ...tempo(bpm, beatsPerBar, beatUnit, pick([0, 0, 125, 1000, 333.25])),
      ...(random() < 0.4 ? { key: { tonic: pick(['C', 'F#', 'Bb']), mode: pick(['major', 'minor']) } as const } : {}) };
    const bar = (k: number): number => barStartFrame(k, t);
    const free = (): number => Math.floor(random() * bar(20));
    const tracks: MusicPlanTrack[] = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => ({
      id: `t${i}`, type: random() < 0.85 ? 'audio' : pick(['midi', 'video'] as const),
      ...(random() < 0.7 ? { musicRole: pick(MUSIC_ROLES) } : {}),
      ...(random() < 0.15 ? { muted: true } : {}), ...(random() < 0.12 ? { solo: true } : {})
    }));
    const clips: MusicPlanClip[] = [];
    for (const track of tracks) {
      for (let c = 0; c < 3; c += 1) {
        if (random() < 0.45) continue;
        const aligned = random() < 0.7;
        const start = aligned ? bar(1 + Math.floor(random() * 14)) : free();
        const end = aligned ? start + bar(2 + Math.floor(random() * 8)) - bar(1) : start + 1 + Math.floor(random() * 600000);
        clips.push(audioClip(`${track.id}c${c}`, track.id, start, end, {
          ...(random() < 0.3 ? { inPointMs: pick([0, 250, 1000 / 3, 5000]) } : {}),
          ...(random() < 0.1 ? { muted: true } : {}),
          ...(random() < 0.08 ? { speedMultiplier: pick([0.5, 1.25, 2]) } : {}),
          ...(random() < 0.05 ? { speedBaked: true } : {}),
          ...(random() < 0.05 ? { timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 1, sourceMs: 1000 }] } } : {}),
          ...(random() < 0.05 ? { currentAssetId: undefined } : {}),
          ...(random() < 0.15 ? { status: pick(['queued', 'failed', 'stale', 'generating', undefined] as const) } : {}),
          ...(random() < 0.08 ? { mediaType: 'video' as const } : {})
        }));
      }
    }
    const trackId = random() < 0.95 ? pick(tracks).id : 'missing';
    const own = clips.filter((c) => c.trackId === trackId);
    let startFrame: number;
    let endFrame: number;
    const shape = random();
    if (shape < 0.3 && own.length > 0) {
      // Inside, or across the edge of, a clip on the target track.
      const c = pick(own);
      const s = msToFrame(c.startMs);
      const e = s + msToFrame(c.durationMs);
      startFrame = s + Math.floor(random() * (e - s) / 2);
      endFrame = random() < 0.7 ? startFrame + 1 + Math.floor(random() * (e - startFrame - 1)) : e + Math.floor(random() * 96000);
    } else if (shape < 0.75) {
      const from = 1 + Math.floor(random() * 16);
      startFrame = bar(from);
      endFrame = bar(from + 1 + Math.floor(random() * (random() < 0.05 ? 400 : 6)));
    } else if (shape < 0.95) {
      startFrame = free();
      endFrame = startFrame + 1 + Math.floor(random() * 700000);
    } else {
      startFrame = pick([0, 10, -96000, 0.5]);
      endFrame = pick([0, 10, 96000.5]);
    }
    cases.push({ tempo: t, tracks, clips, selection: { trackId, startFrame, endFrame },
      ...(random() < 0.3 ? { operation: pick(['text2music', 'repaint', 'lego'] as const) } : {}) });
  }
  const answers = compare(cases.map((c) => ({ fn: 'planMusicOperation', args: [c] }))) as Array<{ refusal?: string; operation: string | null }>;
  // The seeded cases reach every operation and the common refusals.
  const outcomes = new Set(answers.map((a) => a.refusal ?? a.operation));
  for (const outcome of ['text2music', 'repaint', 'lego', 'tempo', 'partial_overlap', 'occupied', 'missing_role', 'invalid_selection']) {
    expect(outcomes, outcome).toContain(outcome);
  }
});
