import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { TimelineProvider, createTimelineInstance, useTimelineStore } from '../../../../../web/src/stores/timeline/TimelineInstance';
import { SpeedDurationDialog } from '../../../../../web/src/components/timeline/clipDialogs/SpeedDurationDialog';
import { ClipTimeRemapSection } from '../../../../../web/src/components/timeline/Inspector/ClipTimeRemap';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, args?: { number?: number }) => args?.number ? key + ':' + args.number : key }) }));
import { retimeClipSpeed } from '../../../../../packages/timeline/src/clipSpeed';
import { clipSourceMsAt, timeRemapAudioSegments } from '../../../../../packages/timeline/src/timeRemap';
import type { TimelineClip, TimelineTrack } from '../../../../../packages/timeline/src/types';
import { createTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore';

// Only the presentation primitives are replaced. All edits run inside the real component and store.
vi.mock('../../../../../web/src/components/ui_primitives', () => {
  const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  const field = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean }) => React.createElement('input', { 'aria-label': label, value, onChange, disabled });
  return { NumberField: field, TextInput: field,
    Checkbox: ({ checked, onChange, label }: { checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>, v: boolean) => void; label: string }) => React.createElement('input', { type: 'checkbox', 'aria-label': label, checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e, e.target.checked) }),
    Dialog: ({ children, onConfirm, confirmDisabled }: { children: React.ReactNode; onConfirm: () => void; confirmDisabled: boolean }) => React.createElement('div', null, children, React.createElement('button', { onClick: onConfirm, disabled: confirmDisabled }, 'Apply')),
    FlexRow: box, FlexColumn: box, Caption: box, SPACING: {},
    CollapsibleSection: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => React.createElement('div', null, title, children),
    Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => React.createElement('button', { onClick, disabled }, children),
    DeleteButton: ({ onClick, disabled, ariaLabel }: { onClick: () => void; disabled: boolean; ariaLabel: string }) => React.createElement('button', { onClick, disabled, 'aria-label': ariaLabel }) };
});
vi.mock('../../../../../web/src/components/timeline/Inspector/InspectorPrimitives', () => ({
  InspectorDivider: () => null, InspectorRow: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  INSPECTOR_ROW_BUTTON_SX: {},
  InspectorSectionTitle: ({ checked, onCheckedChange, checkboxDisabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; checkboxDisabled: boolean }) => React.createElement('input', { type: 'checkbox', checked, disabled: checkboxDisabled, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange(e.target.checked) }),
  InspectorPillInput: ({ value, onCommit, disabled, ariaLabel }: { value: string; onCommit: (s: string) => void; disabled: boolean; ariaLabel: string }) => React.createElement('input', { defaultValue: value, key: value, disabled, 'aria-label': ariaLabel, onBlur: (e: React.FocusEvent<HTMLInputElement>) => onCommit(e.target.value) })
}));

type Doc = { clips: TimelineClip[]; tracks: TimelineTrack[]; linkedSelection?: boolean; syncLockOffTrackIds?: string[] };
type Request = { doc: Doc; action: string; payload: Record<string, unknown> };
function native(requests: Request[]): Doc[] {
  const binary = process.env.NT_SPEED_BINARY;
  if (!binary) throw new Error('NT_SPEED_BINARY is required');
  return JSON.parse(execFileSync(binary, ['--edits'], {
    input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20000,
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
  }));
}
const clip = (id: string, trackId = 'v', startMs = 0, patch: Partial<TimelineClip> = {}): TimelineClip => ({
  id, trackId, startMs, durationMs: 1000, mediaType: 'video', name: id,
  sourceType: 'imported', status: 'generated', versions: [], ...patch
});
const tracks: TimelineTrack[] = ['v', 'a', 'other'].map((id, index) => ({
  id, name: id, type: id === 'v' ? 'video' : 'audio', index, visible: true, muted: false, locked: false
}));
function web(request: Request): TimelineClip[] {
  const { doc, payload, action } = request;
  if (action === 'retimeClipSpeed') {
    return retimeClipSpeed(doc.clips, new Set(Array.isArray(payload.clipIds) ? payload.clipIds : []), Number(payload.speedMultiplier));
  }
  const store = createTimelineStore();
  store.setState({ clips: structuredClone(doc.clips), tracks: doc.tracks,
    linkedSelection: payload.linked === undefined ? (doc.linkedSelection ?? true) : Boolean(payload.linked),
    syncLockOffTrackIds: new Set(doc.syncLockOffTrackIds ?? []) });
  const ids = action === 'setClipsSpeed'
    ? doc.clips.filter(c => Array.isArray(payload.clipIds) && payload.clipIds.includes(c.id))
      .sort((a, b) => b.startMs - a.startMs).map(c => c.id)
    : [String(payload.clipId)];
  for (const id of ids) store.getState().setClipSpeed(id, Number(payload.speedMultiplier), { ripple: Boolean(payload.ripple) });
  return store.getState().clips;
}
function compare(requests: Request[]) {
  const actual = native(requests);
  expect(actual).toHaveLength(requests.length);
  requests.forEach((r, i) => expect(actual[i].clips, JSON.stringify(r)).toEqual(JSON.parse(JSON.stringify(web(r)))));
}
describe('speed edits against web operations', () => {
  it('retimeClipSpeed preserves metadata, caps source windows and stretches captions', () => {
    const doc = { tracks, clips: [clip('c', 'v', 0, { inPointMs: 200, outPointMs: 1200,
      caption: { words: [{ word: 'word', startMs: 100, endMs: 300 }] } }), clip('next', 'v', 1300)] };
    compare([0.1, 0.5, 1, 2, 8, 100].map(speedMultiplier => ({ doc, action: 'retimeClipSpeed', payload: { clipIds: ['c'], speedMultiplier } })));
  });
  it('store links, locks, remap refusal, sync locks, ripple and later-first batches', () => {
    const linked = [clip('c', 'v', 100, { linkId: 'L', outPointMs: 1000 }), clip('sound', 'a', 100, { linkId: 'L' }),
      clip('next', 'v', 1100), clip('nextSound', 'a', 1100), clip('other', 'other', 1100)];
    const docs: Doc[] = [
      { tracks, clips: linked },
      { tracks, clips: linked.map(c => c.linkId === 'L' ? { ...c, linkId: '', locked: c.id === 'sound' } : c) },
      { tracks, clips: linked.map(c => c.id === 'next' || c.id === 'other' ? { ...c, linkId: '' } : c), syncLockOffTrackIds: ['other'] },
      { tracks, clips: linked, syncLockOffTrackIds: ['other', 'a'] },
      { tracks, clips: linked.map(c => c.id === 'sound' ? { ...c, locked: true } : c) },
      { tracks: tracks.map(t => t.id === 'other' ? { ...t, locked: true } : t), clips: linked },
      { tracks, clips: linked.map(c => c.id === 'c' ? { ...c, mediaType: 'group' } : c) },
      { tracks, clips: linked.map(c => c.id === 'sound' ? { ...c, timeRemap: { keyframes: [{ t: 0, sourceMs: 900 }] } } : c) },
      { tracks, clips: linked.map(c => c.id === 'c' ? { ...c, speedBaked: true, speedMultiplier: 4 } : c) },
      { tracks, clips: linked.map(c => ({ ...c, timeRemap: { keyframes: [] } })) }
    ];
    const requests: Request[] = [];
    for (const doc of docs) for (const speedMultiplier of [0.01, 0.5, 1, 2, 100, 0, -1]) {
      for (const ripple of [false, true]) for (const linked of [false, true]) {
        requests.push({ doc, action: 'setClipSpeed', payload: { clipId: 'c', speedMultiplier, ripple, linked } });
        requests.push({ doc, action: 'setClipsSpeed', payload: { clipIds: ['c', 'next', 'sound'], speedMultiplier, ripple, linked } });
      }
    }
    compare(requests);
  });
  it('random documents agree with the real store', () => {
    let seed = 83721;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const requests: Request[] = [];
    for (let n = 0; n < Number(process.env.NT_DIFF_CASES ?? 300); ++n) {
      const doc: Doc = { tracks: tracks.map(t => ({ ...t, locked: random() < 0.1 })),
        linkedSelection: random() < 0.8, syncLockOffTrackIds: random() < 0.5 ? ['other'] : [], clips: [] };
      for (let i = 0; i < 8; ++i) {
        doc.clips.push(clip(String(i), tracks[i % 3].id, Math.round(random() * 20) * 250, {
          durationMs: 250 + Math.round(random() * 10) * 100, speedMultiplier: 0.1 + Math.round(random() * 39) / 10,
          inPointMs: 200, outPointMs: 2400, locked: random() < 0.08,
          ...(random() < 0.3 ? { linkId: 'link' } : {}), ...(random() < 0.1 ? { speedBaked: true } : {}),
          ...(random() < 0.1 ? { timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] } } : {})
        }));
      }
      requests.push({ doc, action: n % 2 ? 'setClipSpeed' : 'setClipsSpeed', payload: {
        clipId: String(n % 8), clipIds: ['0', '3', '5'], speedMultiplier: [0.01, 0.1, 0.5, 1, 2, 4, 8, 100][n % 8], ripple: random() < 0.5
      } });
    }
    compare(requests);
  });
});

// Render the actual remap component. UI events supply the expected documents.
// No copy of its private default/add/patch algorithms lives in this oracle.

function Remap() {
  const selected = useTimelineStore(s => s.clips[0]);
  return React.createElement(ClipTimeRemapSection, { clip: selected });
}
it('remap enable, add, sorted patch, duplicate refusal, reverse, easing, remove and clear match the real component', () => {
  localStorage.setItem('nodetool.timeline.inspector.fold', JSON.stringify({ timeRemap: true }));
  const requests: Request[] = [];
  const expected: TimelineClip[][] = [];
  for (const locked of [false, true]) {
    for (const baked of [false, true]) {
      const instance = createTimelineInstance();
      const store = instance.doc;
      store.setState({ tracks, clips: [clip('c', 'v', 0, { locked, speedBaked: baked, speedMultiplier: 2, inPointMs: 200 })] });
      const view = render(React.createElement(TimelineProvider, { instance, children: React.createElement(Remap) }));
      const act = (payload: Record<string, unknown>, event: () => void) => {
        const doc: Doc = { tracks, clips: structuredClone(store.getState().clips) };
        event();
        requests.push({ doc, action: 'setClipTimeRemap', payload: { clipId: 'c', ...payload } });
        expected.push(JSON.parse(JSON.stringify(store.getState().clips)));
      };
      act({ operation: 'enable' }, () => fireEvent.click(view.getByRole('checkbox')));
      if (!locked) {
        act({ operation: 'enable' }, () => { fireEvent.click(view.getByRole('checkbox')); fireEvent.click(view.getByRole('checkbox')); });
        for (let n = 0; n < 3; n++) act({ operation: 'add' }, () => fireEvent.click(view.getByText('pass3_26.timelineInspector.timeRemap.addKeyframe')));
        const patch = (index: number, field: string, text: string) => {
          const key = field === 't' ? 'keyframeTime' : field === 'sourceMs' ? 'keyframeSourceTime' : 'keyframeEasing';
          act({ operation: 'patch', index, patch: { [field]: text } }, () => {
            const input = view.getByLabelText('pass3_26.timelineInspector.timeRemap.' + key + ':' + (index + 1));
            fireEvent.change(input, { target: { value: text } });
            fireEvent.blur(input);
          });
        };
        patch(0, 't', '1'); // Duplicate.
        patch(1, 't', '0.95'); // Crosses another row.
        patch(0, 't', '-2');
        patch(0, 'sourceMs', '4000');
        patch(4, 'sourceMs', '-10'); // Descending source time is reverse.
        patch(2, 'easing', '  spring(100,10,1)  ');
        patch(2, 'easing', 'not-an-easing');
        patch(2, 'easing', '');
        act({ operation: 'remove', index: 1 }, () => fireEvent.click(view.getByLabelText('pass3_26.timelineInspector.timeRemap.deleteKeyframe:2')));
        act({ operation: 'clear' }, () => fireEvent.click(view.getByText('pass3_26.timelineInspector.timeRemap.clear')));
      }
      cleanup();
    }
  }
  const actual = native(requests);
  actual.forEach((doc, i) => expect(doc.clips, JSON.stringify(requests[i])).toEqual(expected[i]));
  expect(expected.some(clips => (clips[0].timeRemap?.keyframes[0]?.sourceMs ?? 0) > (clips[0].timeRemap?.keyframes.at(-1)?.sourceMs ?? Infinity))).toBe(true);
  expect(actual.every(doc => !('keepPitch' in doc.clips[0]) && !('preservesPitch' in doc.clips[0]))).toBe(true);
});

it('the real speed/duration dialog applies duration edits and later-first multi-clip ripple in one entry', () => {
  const requests: Request[] = [];
  const expected: TimelineClip[][] = [];
  for (const ids of [['c'], ['c', 'later']]) {
    const instance = createTimelineInstance();
    instance.doc.setState({ tracks, clips: [clip('c'), clip('later', 'v', 1000)] });
    const view = render(React.createElement(TimelineProvider, { instance, children: React.createElement(SpeedDurationDialog, { clipIds: ids, onClose: () => {} }) }));
    const speed = view.getByLabelText('batch2_25.speedDuration.speed');
    const duration = view.getByLabelText('batch2_25.speedDuration.duration');
    expect(duration.hasAttribute('disabled')).toBe(ids.length !== 1);
    fireEvent.change(speed, { target: { value: '0' } });
    expect(view.getByText('Apply').hasAttribute('disabled')).toBe(true);
    fireEvent.change(speed, { target: { value: '50' } });
    expect(Reflect.get(duration, 'value')).toBe('00:00:02:00');
    if (ids.length === 1) {
      fireEvent.change(duration, { target: { value: '300' } });
      expect(Reflect.get(speed, 'value')).toBe('33.3');
    }
    fireEvent.click(view.getByRole('checkbox'));
    const multiplier = Number(Reflect.get(speed, 'value')) / 100;
    requests.push({ doc: { tracks, clips: structuredClone(instance.doc.getState().clips) }, action: 'setClipsSpeed', payload: { clipIds: ids, speedMultiplier: multiplier, ripple: true } });
    fireEvent.click(view.getByText('Apply'));
    expected.push(JSON.parse(JSON.stringify(instance.doc.getState().clips)));
    expect(instance.doc.temporal.getState().pastStates).toHaveLength(2); // Seed plus one batched edit.
    cleanup();
  }
  native(requests).forEach((doc, i) => expect(doc.clips).toEqual(expected[i]));
});

type TimingResult = {
  sourceTimes: number[];
  sceneTimes: Array<number | null>;
  segments: ReturnType<typeof timeRemapAudioSegments>;
};

it('preview source times and audio segments match the web remap sampler', () => {
  const easings = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeOutBack', 'easeOutElastic',
    'easeOutBounce', 'easeInExpo', 'easeOutExpo', 'easeInOutExpo', 'easeInQuint', 'easeOutQuint',
    'easeInOutQuint', 'easeInCirc', 'easeOutCirc', 'easeInOutCirc', 'hold',
    'cubic-bezier(.2,-.5,.8,1.4)', 'cubic-bezier(-1,2,3,-2)', 'spring(100,10,1)',
    'spring(100,20,1)', 'spring(100,30,1)', 'unknown', 'spring(0,10,1)',
    'cubic-bezier(1,,2,3)', '  easeIn  ', ''];
  type Frames = NonNullable<TimelineClip['timeRemap']>['keyframes'];
  const curves: Frames[] = [[], [{ t: 0.5, sourceMs: 777 }], [{ t: 0.5, sourceMs: -20 }],
    [{ t: 0.25, sourceMs: 0 }, { t: 0.75, sourceMs: 1000 }],
    [{ t: 0.25, sourceMs: 1000 }, { t: 0.75, sourceMs: 0 }],
    [{ t: 0.75, sourceMs: 300 }, { t: 0.25, sourceMs: 200 }, { t: 1, sourceMs: 1000 }],
    [{ t: -0.2, sourceMs: 100 }, { t: 0.4, sourceMs: 500 }, { t: 1.3, sourceMs: 200 }]];
  for (const easing of easings) curves.push([{ t: 0.1, sourceMs: 0 }, { t: 0.9, sourceMs: 2000, easing }]);
  let seed = 7319;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let n = 0; n < Number(process.env.NT_DIFF_CASES ?? 300); ++n) {
    curves.push(Array.from({ length: 1 + Math.floor(random() * 8) }, () => ({
      t: Math.round((random() * 1.4 - 0.2) * 1000) / 1000,
      sourceMs: random() * 5000 - 100, easing: easings[Math.floor(random() * easings.length)]
    })).sort((a, b) => a.t - b.t));
  }
  const clips = curves.map((keyframes, i) => clip('c', 'v', 100 + i * 0.1, {
    durationMs: 1000 + i * 1.7, inPointMs: 123, speedMultiplier: 3.5, speedBaked: i % 2 === 0,
    mediaPath: 'unused.wav', timeRemap: { keyframes }
  }));
  clips.push(clip('c', 'v', 100, { mediaPath: 'unused.wav', inPointMs: 123, speedMultiplier: 2 }));
  const requests = clips.map(c => ({ doc: { tracks, clips: [c] }, times: [
    c.startMs - 200, c.startMs, ...Array.from({ length: 21 }, (_, i) => c.startMs + c.durationMs * i / 21),
    ...c.timeRemap?.keyframes.flatMap(k => [c.startMs + k.t * c.durationMs - 1e-7, c.startMs + k.t * c.durationMs, c.startMs + k.t * c.durationMs + 1e-7]) ?? [],
    c.startMs + c.durationMs, c.startMs + c.durationMs + 200
  ] }));
  const binary = process.env.NT_SPEED_BINARY;
  if (!binary) throw new Error('NT_SPEED_BINARY is required');
  const actual: TimingResult[] = JSON.parse(execFileSync(binary, ['--timing'], {
    input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20000,
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
  }));
  expect(actual).toHaveLength(requests.length);
  requests.forEach((request, index) => {
    const c = request.doc.clips[0];
    const result = actual[index];
    const context = JSON.stringify(c);
    expect(result.sourceTimes, context).toHaveLength(request.times.length);
    request.times.forEach((time, i) => {
      const expected = clipSourceMsAt(c, time);
      expect(Math.abs(result.sourceTimes[i] - expected), context + ' at ' + time).toBeLessThanOrEqual(1e-6);
      if (time >= c.startMs && time < c.startMs + c.durationMs) {
        expect(result.sceneTimes[i], context).not.toBeNull();
        expect(Math.abs((result.sceneTimes[i] ?? NaN) - expected), context).toBeLessThanOrEqual(1e-6);
      }
    });
    const segments = timeRemapAudioSegments(c);
    expect(result.segments, context).toHaveLength(segments.length);
    segments.forEach((segment, i) => {
      const part = result.segments[i];
      for (const key of ['timelineStartMs', 'timelineEndMs', 'sourceStartMs', 'sourceEndMs', 'rate'] as const) {
        expect(Math.abs(part[key] - segment[key]), context + ' segment ' + i + ' ' + key).toBeLessThanOrEqual(1e-6);
      }
      expect(part.reverse, context).toBe(segment.reverse);
    });
  });
});
