import { execFileSync } from 'node:child_process';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeClip, makeTrack, parseClipFadeShape } from '../../../../../packages/timeline/src/index';
import { createTimelineStore, useTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore';
import { createTimelineInstance, TimelineProvider } from '../../../../../web/src/stores/timeline/TimelineInstance';
import { maxFadeMs, useClipFade } from '../../../../../web/src/components/timeline/Tracks/useClipFade';
import { CLIP_FADE_SHAPE_LABELS, CLIP_FADE_SHAPE_HINTS, CLIP_FADE_SHAPE_OPTIONS } from '../../../../../web/src/components/timeline/fadeShapes';
import { parseSeconds } from '../../../../../web/src/components/timeline/Inspector/InspectorPrimitives.helpers';

function native(requests: readonly unknown[]): unknown[] {
  const binary = process.env.NT_CLIP_AUDIO;
  if (!binary) throw new Error('NT_CLIP_AUDIO is required');
  return JSON.parse(execFileSync(binary, ['--json'], {
    input: JSON.stringify(requests), encoding: 'utf8',
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
  }));
}
function random(seed: number): () => number {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
const shapes = ['linear', 'sCurve', 'plus3dB', 'minus3dB'] as const;
const edges = ['in', 'out'] as const;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('clip audio against the web editor', () => {
  it('runs registered edits against the real web store on random documents', () => {
    const r = random(0xd2);
    const requests: unknown[] = [];
    const expected: unknown[] = [];
    for (let n = 0; n < 80; ++n) {
      const tracks = [
        makeTrack({ id: 'a', type: 'audio', locked: r() < 0.3 }),
        makeTrack({ id: 'v', type: 'video' })
      ];
      const clips = ['audio', 'video', 'midi', 'image', 'text'].map((mediaType, i) => makeClip({
        id: `c${i}`, trackId: i % 2 ? 'v' : 'a',
        mediaType: mediaType === 'audio' ? 'audio' : mediaType === 'video' ? 'video' : mediaType === 'midi' ? 'midi' : mediaType === 'image' ? 'image' : 'text',
        durationMs: Math.floor(r() * 8000) + 1, startMs: 0,
        locked: r() < 0.2, ...(r() < 0.5 ? { volumeDb: r() * 144 - 120 } : {})
      }));
      const document = { name: 'Oracle', width: 640, height: 360, fps: 30, durationMs: 9000, tracks, clips };
      const store = createTimelineStore();
      store.setState({ tracks, clips: structuredClone(clips) });
      const edits: { name: string; payload: Record<string, unknown> }[] = [];
      const target = clips[n % 3];
      const volumeDb = Math.round((r() * 72 - 60) * 2) / 2;
      store.getState().patchClip(target.id, { volumeDb });
      edits.push({ name: 'setClipAudio', payload: { clipId: target.id, field: 'volumeDb', value: volumeDb } });
      for (const edge of edges) {
        const seconds = String(r() * 12);
        const parsed = parseSeconds(seconds);
        if (parsed === null) throw new Error('generated seconds must parse');
        const ms = Math.max(0, Math.min(Math.floor(target.durationMs / 2), parsed));
        store.getState().patchClip(target.id, edge === 'in' ? { fadeInMs: ms } : { fadeOutMs: ms });
        edits.push({ name: 'setClipAudio', payload: { clipId: target.id, field: edge === 'in' ? 'fadeInMs' : 'fadeOutMs', value: parsed } });
        const shape = shapes[n % shapes.length];
        store.getState().patchClip(target.id, edge === 'in' ? { fadeInShape: shape } : { fadeOutShape: shape });
        edits.push({ name: 'setClipAudio', payload: { clipId: target.id, field: edge === 'in' ? 'fadeInShape' : 'fadeOutShape', value: shape } });
      }
      const selectedIds = clips.filter(() => r() < 0.8).map(c => c.id);
      const db = Math.floor(r() * 500 - 250);
      const mode = n % 2 ? 'set' : 'adjust';
      store.getState().setClipsGain(new Set(selectedIds), db, mode);
      edits.push({ name: 'setClipsGain', payload: { selectedIds, db, mode } });
      requests.push({ document, edits });
      expected.push(store.getState().clips);
    }
    const actual = native(requests);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });

  it('compares the actual QML shape catalog and parser with TypeScript', () => {
    const values = [null, '', 'Linear', 'unknown', 1, {}, ...shapes];
    const requests = values.map(value => ({ helper: 'parseClipFadeShape', args: [value] }));
    expect(native(requests)).toEqual(values.map(parseClipFadeShape));
    expect(native([{ helper: 'catalog', args: [] }])).toEqual([{
      shapes, labels: CLIP_FADE_SHAPE_LABELS, hints: CLIP_FADE_SHAPE_HINTS, options: CLIP_FADE_SHAPE_OPTIONS
    }]);
  });

  it('compares grip drag and arrow arithmetic with useClipFade handlers', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const instance = createTimelineInstance();
    let edge: 'in' | 'out' = 'in';
    let msPerPx = 1;
    function Handle(): React.ReactElement {
      const clip = useTimelineStore(s => s.clips[0]);
      const handlers = useClipFade({ clip, msPerPx, interactionLocked: false, onRequestShapeMenu: () => {} });
      return React.createElement('button', {
        onPointerDown: event => handlers.onFadePointerDown(edge, event),
        onPointerMove: handlers.onFadePointerMove,
        onPointerUp: handlers.onFadePointerEnd,
        onKeyDown: event => handlers.onFadeKeyDown(edge, event)
      }, 'Fade');
    }
    const view = render(React.createElement(TimelineProvider, { instance, children: React.createElement(Handle) }));
    const button = view.getByRole('button');
    Object.defineProperty(button, 'setPointerCapture', { value: () => {} });
    const r = random(0xfade);
    const requests: unknown[] = [];
    const expected: unknown[] = [];
    for (let n = 0; n < 64; ++n) {
      edge = n % 2 ? 'in' : 'out';
      msPerPx = r() * 30 + 0.1;
      const clip = makeClip({ id: 'c', trackId: 'a', mediaType: 'audio', durationMs: r() * 5000,
        fadeInMs: r() * 3000 - 500, fadeOutMs: r() * 3000 - 500 });
      act(() => instance.doc.setState({ clips: [clip] }));
      const start = (edge === 'in' ? clip.fadeInMs : clip.fadeOutMs) ?? 0;
      requests.push({ helper: 'maxFadeMs', args: [clip, edge] });
      expected.push(maxFadeMs(clip, edge));
      const deltaPx = r() * 400 - 200;
      act(() => {
        fireEvent.pointerDown(button, { button: 0, buttons: 1, clientX: 100, pointerId: 1 });
        fireEvent.pointerMove(button, { buttons: 1, clientX: 100 + deltaPx, pointerId: 1 });
        fireEvent.pointerUp(button, { button: 0, buttons: 0, pointerId: 1 });
      });
      requests.push({ helper: 'dragFadeMs', args: [clip, edge, start, deltaPx, msPerPx] });
      const dragged = instance.doc.getState().clips[0];
      expected.push(edge === 'in' ? dragged.fadeInMs : dragged.fadeOutMs);
      act(() => instance.doc.setState({ clips: [clip] }));
      const key = n % 4 < 2 ? 'ArrowLeft' : 'ArrowRight';
      const shift = n % 3 === 0;
      act(() => fireEvent.keyDown(button, { key, shiftKey: shift }));
      requests.push({ helper: 'keyFadeMs', args: [clip, edge, key, shift] });
      const keyed = instance.doc.getState().clips[0];
      expected.push(edge === 'in' ? keyed.fadeInMs : keyed.fadeOutMs);
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(native(requests)).toEqual(expected);
  });
});
