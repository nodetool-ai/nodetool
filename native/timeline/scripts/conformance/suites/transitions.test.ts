import { execFileSync } from 'node:child_process';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore';
import { TimelineProvider, createTimelineInstance, useTimelineStore } from '../../../../../web/src/stores/timeline/TimelineInstance';
import { ClipTransitionSection } from '../../../../../web/src/components/timeline/Inspector/ClipTransitionSection';
import type { TimelineClip, TimelineTrack } from '../../../../../packages/timeline/src/types';

const { sourceLengths } = vi.hoisted(() => ({ sourceLengths: new Map<string, number>() }));
vi.mock('../../../../../web/src/components/timeline/Tracks/useClipSourceDuration', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), getKnownSourceDurationMs: (id: string) => sourceLengths.get(id)
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// Presentation only. Mode construction, carry-over, parsing, lock guards and edits run in the real components.
vi.mock('../../../../../web/src/components/ui_primitives', () => {
  const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { Caption: box, FlexColumn: box, CollapsibleSection: box, SPACING: {},
    BatchedColorInput: ({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (v: string) => void; ariaLabel: string; disabled: boolean }) =>
      React.createElement('input', { value, disabled, 'aria-label': ariaLabel, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }) };
});
vi.mock('../../../../../web/src/components/timeline/Inspector/InspectorPrimitives', () => ({
  InspectorDivider: () => null, InspectorSectionTitle: () => null,
  InspectorRow: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  InspectorSelect: ({ value, options, onChange, label, disabled }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string; disabled: boolean }) =>
    React.createElement('select', { value, disabled, 'aria-label': label, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }, options.map(o => React.createElement('option', { key: o.value, value: o.value }, o.label))),
  InspectorPillInput: ({ value, onCommit, ariaLabel, disabled }: { value: string; onCommit: (v: string) => void; ariaLabel: string; disabled: boolean }) =>
    React.createElement('input', { key: value, defaultValue: value, disabled, 'aria-label': ariaLabel, onBlur: (e: React.FocusEvent<HTMLInputElement>) => onCommit(e.target.value) }),
  InspectorSliderRow: ({ value, onChange, label, disabled }: { value: number; onChange: (v: number) => void; label: string; disabled: boolean }) =>
    React.createElement('input', { type: 'range', value, min: 0, max: 1, step: 0.01, disabled, 'aria-label': label, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)) })
}));
type Doc = { clips: TimelineClip[]; tracks: TimelineTrack[] };
type Request = { doc: Doc; action: string; payload: Record<string, unknown> };
const clip = (id: string, startMs = 0, patch: Partial<TimelineClip> = {}): TimelineClip => ({
  id, name: id, trackId: 'v', startMs, durationMs: 1000, mediaType: 'video', sourceType: 'imported', status: 'generated', versions: [], ...patch
});
const tracks: TimelineTrack[] = ['v', 'a'].map((id, index) => ({ id, name: id, type: id === 'v' ? 'video' : 'audio', index, visible: true, locked: false, muted: false }));
function native(requests: Request[]): Doc[] {
  const binary = process.env.NT_TRANSITIONS_BINARY;
  if (!binary) throw new Error('NT_TRANSITIONS_BINARY is required');
  return JSON.parse(execFileSync(binary, ['--edits'], { input: JSON.stringify(requests), encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' } }));
}
const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function web(request: Request): TimelineClip[] {
  sourceLengths.clear();
  for (const c of request.doc.clips) for (const v of c.versions) {
    if (v.assetId === c.currentAssetId && v.durationMs !== undefined) sourceLengths.set(v.assetId, v.durationMs);
  }
  const store = createTimelineStore(); store.setState(structuredClone(request.doc));
  const { payload, action } = request;
  if (action === 'removeTransition') store.getState().removeTransition(String(payload.clipId));
  else store.getState().setTransitionDuration(String(payload.clipId), Number(payload.durationMs));
  return json(store.getState().clips);
}
function compare(requests: Request[]) {
  const actual = native(requests); expect(actual).toHaveLength(requests.length);
  requests.forEach((r, i) => expect(actual[i].clips, JSON.stringify(r)).toEqual(web(r)));
}
describe('transition store oracle', () => {
  it('caps, zero, predecessors, links, locks, remaps and metadata', () => {
    const outgoing = clip('out', 0, { linkId: 'L', inPointMs: 100, speedMultiplier: 2 });
    const incoming = clip('in', 1000, { transitionIn: { type: 'wipe', durationMs: 500, direction: 'right', softness: 0.4, easing: 'easeOut' } });
    const docs: Doc[] = [
      { tracks, clips: [outgoing, incoming] },
      { tracks, clips: [incoming] },
      ...[2000, 2500, 5000].map(durationMs => ({ tracks, clips: [{ ...outgoing, currentAssetId: 'source', versions: [{
        id: 'take', assetId: 'source', createdAt: '', jobId: '', workflowUpdatedAt: '', dependencyHash: '', paramOverridesSnapshot: {}, status: 'success' as const, durationMs
      }] }, incoming] })),
      { tracks, clips: [{ ...outgoing, animations: [{ id: 'source-curve', preset: 'custom', role: 'emphasis', durationMs: 1000,
        custom: { timeBase: 'source', curves: [{ channel: 'opacity', keyframes: [{ t: 0, sourceMs: 100, value: 0.2 }, { t: 1, sourceMs: 2100, value: 1, easing: 'easeIn' }] }] }
      }] }, incoming] },
      { tracks, clips: [{ ...outgoing, durationMs: 1200 }, incoming] },
      { tracks, clips: [{ ...outgoing, durationMs: 999 }, incoming] },
      { tracks, clips: [{ ...outgoing, durationMs: 998 }, incoming] },
      { tracks, clips: [outgoing, incoming, clip('sound', 0, { linkId: 'L', trackId: 'a', mediaType: 'audio' })] },
      { tracks, clips: [outgoing, incoming, clip('sound', 0, { linkId: 'L', trackId: 'a', locked: true, durationMs: 500 })] },
      { tracks: tracks.map(t => ({ ...t, locked: t.id === 'a' })), clips: [outgoing, incoming, clip('sound', 0, { linkId: 'L', trackId: 'a' })] },
      { tracks, clips: [{ ...outgoing, locked: true }, incoming] },
      { tracks, clips: [outgoing, { ...incoming, locked: true }] },
      { tracks: tracks.map(t => ({ ...t, locked: true })), clips: [outgoing, incoming] },
      { tracks, clips: [{ ...outgoing, timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] } }, incoming] },
      { tracks, clips: [{ ...outgoing, speedBaked: true, speedMultiplier: 4 }, incoming] },
      { tracks, clips: [{ ...outgoing, animations: [{ id: 'key', role: 'emphasis', preset: 'custom', durationMs: 1000, params: { keyframed: true }, custom: { curves: [] } }] }, incoming] }
    ];
    const requests: Request[] = [];
    for (const doc of docs) for (const clipId of ['in', 'out', 'missing']) {
      for (const durationMs of [-10, 0, 100, 500, 1100, 10000]) requests.push({ doc, action: 'setTransitionDuration', payload: { clipId, durationMs } });
      requests.push({ doc, action: 'removeTransition', payload: { clipId } });
    }
    compare(requests);
  });
  it('random documents match the real store', () => {
    let seed = 418374; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const requests: Request[] = [];
    for (let n = 0; n < Number(process.env.NT_DIFF_CASES ?? 300); n++) {
      const doc: Doc = { tracks: tracks.map(t => ({ ...t, locked: random() < 0.1 })), clips: [] };
      for (let i = 0; i < 8; i++) doc.clips.push(clip(String(i), Math.round(random() * 12) * 250, {
        trackId: random() < 0.3 ? 'a' : 'v', durationMs: 250 + Math.round(random() * 12) * 100,
        locked: random() < 0.1, speedMultiplier: [0.5, 1, 2][i % 3], inPointMs: 100,
        ...(random() < 0.4 ? { linkId: 'L' } : {}), ...(random() < 0.2 ? { outPointMs: 2000 } : {}),
        ...(random() < 0.5 ? { transitionIn: { type: 'crossfade', durationMs: random() < 0.3 ? 0 : 500, easing: 'future-easing' } } : {})
      }));
      requests.push({ doc, action: n % 5 ? 'setTransitionDuration' : 'removeTransition', payload: { clipId: String(n % 8), durationMs: Math.round(random() * 25) * 100 } });
    }
    compare(requests);
  });
});
function Section() { const selected = useTimelineStore(s => s.clips.find(c => c.id === 'in')); return selected ? React.createElement(ClipTransitionSection, { clip: selected }) : null; }
it('real component: every mode, carry-over, duration, easing, colour, direction, softness and refusals', () => {
  localStorage.setItem('nodetool.timeline.inspector.fold', JSON.stringify({ transition: true }));
  const requests: Request[] = []; const expected: TimelineClip[][] = [];
  for (const locked of ['none', 'clip', 'track']) {
    const instance = createTimelineInstance();
    instance.doc.setState({ tracks: tracks.map(t => ({ ...t, locked: locked === 'track' })), clips: [clip('out'), clip('in', 1000, { locked: locked === 'clip' })] });
    const view = render(React.createElement(TimelineProvider, { instance, children: React.createElement(Section) }));
    const event = (action: string, payload: Record<string, unknown>, fn: () => void) => {
      const doc = { tracks: instance.doc.getState().tracks, clips: structuredClone(instance.doc.getState().clips) };
      const past = instance.doc.temporal.getState().pastStates.length;
      fn(); requests.push({ doc, action, payload: { clipId: 'in', ...payload } }); expected.push(json(instance.doc.getState().clips));
      if (locked === 'none' && JSON.stringify(doc.clips) !== JSON.stringify(expected.at(-1))) expect(instance.doc.temporal.getState().pastStates.length).toBe(Math.min(100, past + 1));
    };
    const changeMode = (mode: string) => event('setClipTransition', { mode }, () => fireEvent.change(view.getByLabelText('pass3_27.clipTransition.typeAria'), { target: { value: mode } }));
    const pill = (label: string, text: string, action: string, payload: Record<string, unknown>) => event(action, payload, () => {
      const field = view.getByLabelText(label); fireEvent.change(field, { target: { value: text } }); fireEvent.blur(field);
    });
    if (locked !== 'none') { changeMode('wipe'); cleanup(); continue; }
    for (const mode of ['wipe', 'push', 'slide', 'zoom', 'crossfade', 'dipToColor', 'none', 'auto', 'wipe']) {
      changeMode(mode);
      if (['none', 'auto'].includes(mode)) continue;
      pill('pass3_27.clipTransition.durationAria', '0.80s', 'setTransitionDuration', { durationMs: 800 });
      for (const text of ['easeIn', 'easeOut', 'easeInOut', 'easeOutBack', 'easeOutElastic', 'easeOutBounce', 'cubic-bezier(0.2,0,0.8,1)', 'spring(100,10,1)', '  future-easing  ', '', 'easeIn']) {
        pill('pass3_27.clipTransition.easingAria', text, 'setClipTransition', { patch: { easing: text.trim() || null } });
      }
      if (['wipe', 'push', 'slide'].includes(mode)) for (const direction of ['right', 'up', 'down', 'left']) {
        event('setClipTransition', { patch: { direction } }, () => fireEvent.change(view.getByLabelText('pass3_27.clipTransition.directionAria'), { target: { value: direction } }));
      }
      if (mode === 'wipe') event('setClipTransition', { patch: { softness: 0.75 } }, () => fireEvent.change(view.getByLabelText('pass3_27.clipTransition.softness'), { target: { value: '0.75' } }));
      if (mode === 'dipToColor') event('setClipTransition', { patch: { color: '#123456' } }, () => fireEvent.change(view.getByLabelText('pass3_27.clipTransition.colorAria'), { target: { value: '#123456' } }));
    }
    cleanup();
  }
  const actual = native(requests); actual.forEach((doc, i) => expect(doc.clips, JSON.stringify(requests[i])).toEqual(expected[i]));
});
