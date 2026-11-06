import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildBeatGrid, beatCountToCover, nearestGridTime, snapClipsToGrid, beatGridPhaseMs, planClipBeats } from '../../../../../packages/timeline/src/beats';
import { resolveTempo } from '../../../../../packages/timeline/src/midi/tempo';
import { beatDurationMs, barDurationMs, barsBeatsAt, tempoGridMs } from '../../../../../packages/timeline/src/midi/grid';
import { divisionToTicks, QUANTIZE_DIVISIONS } from '../../../../../packages/timeline/src/midi/edit';
import { ticksToMs } from '../../../../../packages/timeline/src/midi/ticks';
import { tempoGridIntervalMs, visibleTempoGrid, computeBarRulerTicks, GRID_DIVISION_OPTIONS } from '../../../../../web/src/components/timeline/Tracks/tempoGrid';
import { snapGridSpecFrom, gridSnapApplies, collectSnapCandidates } from '../../../../../web/src/components/timeline/Tracks/clipSnap';
import type { TimelineTempo } from '../../../../../packages/timeline/src/types';

// Reflect.apply keeps the transport untyped without weakening the imported functions.
const functions = { buildBeatGrid, beatCountToCover, nearestGridTime, snapClipsToGrid, beatGridPhaseMs, planClipBeats,
  resolveTempo, beatDurationMs, barDurationMs, barsBeatsAt, tempoGridMs, divisionToTicks, ticksToMs,
  tempoGridIntervalMs, visibleTempoGrid, computeBarRulerTicks, snapGridSpecFrom, gridSnapApplies };
type Request = { fn: keyof typeof functions | 'GRID_DIVISION_OPTIONS' | 'mergeSnapCandidates'; args: unknown[] };
function web(request: Request): unknown {
  try {
    if (request.fn === 'GRID_DIVISION_OPTIONS') return GRID_DIVISION_OPTIONS;
    if (request.fn === 'mergeSnapCandidates') {
      return Reflect.apply(collectSnapCandidates, undefined, [...request.args.slice(2), new Set(), request.args[1]]);
    }
    return Reflect.apply(functions[request.fn], undefined, request.args);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { error: error.message };
  }
}
let comparisonCount = 0;
afterAll(() => console.info(`Tempo oracle: ${comparisonCount} requests compared`));
function compare(requests: Request[]): void {
  comparisonCount += requests.length;
  const binary = process.env.NT_TEMPO_BINARY;
  if (!binary) throw new Error('NT_TEMPO_BINARY is required');
  const directory = mkdtempSync(path.join(tmpdir(), 'tempo-oracle-'));
  const inputFile = path.join(directory, 'requests.json');
  writeFileSync(inputFile, JSON.stringify(requests, (_key, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? { $number: String(value) } : value));
  const input = openSync(inputFile, 'r');
  let actual: unknown[];
  try {
    // A file descriptor avoids the sandbox's hanging synchronous stdin socket.
    actual = JSON.parse(execFileSync(binary, ['--oracle'], {
      stdio: [input, 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
    }));
  } finally {
    closeSync(input);
    rmSync(directory, { recursive: true, force: true });
  }
  expect(actual).toHaveLength(requests.length);
  requests.forEach((request, i) => expect(actual[i], JSON.stringify(request)).toEqual(JSON.parse(JSON.stringify(web(request)))));
}
const tempo = (bpm = 120, offsetMs = 0, beatsPerBar = 4, beatUnit = 4): TimelineTempo => ({ bpm, offsetMs, timeSignature: { beatsPerBar, beatUnit } });
it('beat grids match rounding, deduplication, fractional BPM and every validation message', () => {
  const specs = [
    {}, { onsetsMs: [0], bpm: 120 }, { onsetsMs: [] }, { onsetsMs: [-1] }, { onsetsMs: [NaN] },
    { onsetsMs: [Infinity] }, { onsetsMs: Array(2049).fill(0) },
    { onsetsMs: [1000.5, 0.5, 1.5, 1000.49, 0, 1000.5, 0.49999999999999994, 4503599627370495.5] },
    { bpm: 120, count: 1000000000000000128 }, { bpm: 120, count: 1e21 }, { bpm: 120, count: 4, offsetMs: -1e-7 }, { onsetsMs: [-1e-6] },
    ...[0, -10, NaN, Infinity].map(bpm => ({ bpm, count: 4 })),
    ...[-1, NaN, Infinity].map(offsetMs => ({ bpm: 120, count: 4, offsetMs })),
    ...[undefined, 0, -1, 1.5, NaN, Infinity, 2049].map(count => ({ bpm: 120, count })),
    ...[60, 120, 140, 137.57, 1e9].flatMap(bpm => [1, 2, 2048].map(count => ({ bpm, offsetMs: 0.5, count })))
  ];
  compare(specs.map(spec => ({ fn: 'buildBeatGrid', args: [spec] })));
});
it('nearest ties and clip snapping match every mode, action and skip reason', () => {
  const requests: Request[] = [];
  for (const grid of [[], [NaN], [100, 0], [0, 500, 1000], [-100, 100, 900], [500]]) {
    for (const toleranceMs of [-10, 0, 50, 60, 1000, NaN]) {
      for (const time of [-1, 0, 50, 250, 900.5]) requests.push({ fn: 'nearestGridTime', args: [time, grid, toleranceMs] });
      for (const mode of ['start', 'end', 'both']) for (const action of ['move', 'trim']) {
        const clips = [[0, 500], [10, 480], [50, 50], [10, 80], [123, 333], [-5, 10], [500, 0]].map(([startMs, durationMs], n) => ({ id: String(n), startMs, durationMs }));
        requests.push({ fn: 'snapClipsToGrid', args: [clips, grid, { toleranceMs, mode, action }] });
      }
    }
  }
  requests.push({ fn: 'snapClipsToGrid', args: [[{ id: 'default', startMs: 10, durationMs: 400 }], [0, 500]] });
  compare(requests);
});
it('coverage, onset phase and clip beat plans agree on generated vectors', () => {
  const requests: Request[] = [];
  let seed = 9832;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let n = 0; n < 300; ++n) {
    const bpm = [0, -1, 60, 120, 140, 137.73, 600][n % 7];
    const onsets = n % 8 ? Array.from({ length: 8 }, () => Math.round(random() * 20000) - 500) : [];
    requests.push({ fn: 'beatCountToCover', args: [bpm, 500, n % 2 ? random() * 1e9 : -100] });
    requests.push({ fn: 'beatGridPhaseMs', args: [onsets, bpm] });
    requests.push({ fn: 'planClipBeats', args: [{ startMs: Math.round(random() * 4000), durationMs: n % 2 ? 20000 : 1e9, rate: [0, -1, 0.5, 1, 1.37, 2][n % 6] }, onsets, bpm, [0, 1, 2.5, 4, 6][n % 5]] });
  }
  requests.push({ fn: 'beatGridPhaseMs', args: [[0, 250], 120] }, { fn: 'beatGridPhaseMs', args: [[250, 0], 120] });
  compare(requests);
});
it('raw tempo resolution preserves missing, partial and complete tempo', () => {
  compare([{}, { tempo: null }, { tempo: {} }, { tempo: { bpm: 90 } }, { tempo: tempo(140, 123, 6, 8) }].map(doc => ({ fn: 'resolveTempo', args: [doc] })));
});
it('bars, all grid divisions and ruler zoom rules match the real web functions', () => {
  const requests: Request[] = [{ fn: 'GRID_DIVISION_OPTIONS', args: [] }];
  for (const division of QUANTIZE_DIVISIONS) requests.push({ fn: 'divisionToTicks', args: [division] });
  requests.push({ fn: 'divisionToTicks', args: ['unknown'] });
  for (const t of [tempo(), tempo(140, 123), tempo(97.3, 750, 6, 8), tempo(200, 5000, 3, 4)]) {
    requests.push({ fn: 'beatDurationMs', args: [t] }, { fn: 'barDurationMs', args: [t] });
    for (const ticks of [0, 1, 120, 320, 960, 5000]) requests.push({ fn: 'ticksToMs', args: [ticks, t.bpm] });
    for (const time of [-5000, -1, 0, 123, 499.999999, 500, 2000, 10000, ...Array.from({ length: 32 }, (_, i) => t.offsetMs + i * 60000 / t.bpm)]) {
      requests.push({ fn: 'barsBeatsAt', args: [time, t] });
    }
    for (const { value: division } of GRID_DIVISION_OPTIONS) {
      requests.push({ fn: 'tempoGridIntervalMs', args: [t, division] });
      for (const [fromMs, toMs] of [[-1000, 10000], [0, 0], [2000, 1000], [500, 500], [100, 10000], [0, 1e9], [123, 1e9], [NaN, 1000]]) {
        requests.push({ fn: 'visibleTempoGrid', args: [{ tempo: t, division, fromMs, toMs }] });
        requests.push({ fn: 'tempoGridMs', args: [{ tempo: t, division, fromMs, toMs }] });
      }
    }
    for (const msPerPx of [0, -1, NaN, 1, 10, 32, 40, 50, 62.5, 100, 200, 1000, 1e6]) {
      for (const fromMs of [0, 1000, 5100]) requests.push({ fn: 'computeBarRulerTicks', args: [{ tempo: t, msPerPx, fromMs, toMs: fromMs + 20000 }] });
    }
  }
  for (const t of [tempo(0), tempo(-1), tempo(NaN), tempo(120, 0, 0), tempo(120, 0, 4, 0)]) {
    requests.push({ fn: 'beatDurationMs', args: [t] });
  }
  compare(requests);
});
it('snap specs, applicability and candidate merging agree with collectSnapCandidates', () => {
  const requests: Request[] = [];
  for (const snapEnabled of [false, true]) for (const rulerMode of ['time', 'bars']) for (const hasMidiTrack of [false, true]) {
    for (const lanesViewportWidthPx of [0, 400, 1200]) {
      const doc = { tracks: hasMidiTrack ? [{ type: 'midi' }] : [{ type: 'video' }], tempo: tempo(140, 123) };
      const ui = { snapEnabled, rulerMode, gridDivision: '1/8T', msPerPx: 10, scrollLeftPx: 120, lanesViewportWidthPx };
      requests.push({ fn: 'snapGridSpecFrom', args: [doc, ui] });
    }
    for (const { value: division } of GRID_DIVISION_OPTIONS) {
      for (const toMs of [0, 10000, 1e9]) {
        const grid = { tempo: tempo(140, 123), division, fromMs: 100, toMs, snapEnabled, rulerMode, hasMidiTrack };
        requests.push({ fn: 'gridSnapApplies', args: [grid] });
        const base = collectSnapCandidates([], 10000, 333, new Set());
        requests.push({ fn: 'mergeSnapCandidates', args: [base, grid, [], 10000, 333] });
      }
    }
  }
  requests.push({ fn: 'snapGridSpecFrom', args: [{ tracks: [] }, { snapEnabled: true, rulerMode: 'bars', gridDivision: 'bar', msPerPx: 2, scrollLeftPx: 0, lanesViewportWidthPx: 0 }] });
  compare(requests);
});
