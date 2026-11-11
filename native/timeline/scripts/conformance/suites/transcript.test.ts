// The Text panel against the web editor: the words it reads, the range a selection marks, the range
// edit that range drives, and the cues the caption edits leave behind.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { makeClip, makeTrack, type TimelineClip } from '@nodetool-ai/timeline';
import { clipCaption } from '../../../../../packages/protocol/src/api-schemas/timeline';
import { captionCues, CAPTION_CUE_GAP_MS, CAPTION_CUE_MAX_WORDS } from '../../../../../packages/timeline/src/render/sceneModel';
import { createTimelineStore } from '../../../../../web/src/stores/timeline/TimelineStore';
import { buildTranscriptDoc, resolveSelectionRange } from '../../../../../web/src/stores/timeline/transcriptOps';
import { checkIds, inputIds, normalize } from '../normalize';

type Doc = { id: string; fps: number; width: number; height: number; durationMs: number; tracks: ReturnType<typeof makeTrack>[]; clips: TimelineClip[]; mediaTracks: never[] };
function rng(seed: number): () => number {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}
function oracle<T>(operation: string, document: unknown, payload: unknown = {}): T {
  if (!process.env.NT_ASSIST_BINARY) throw new Error('NT_ASSIST_BINARY is required');
  return JSON.parse(execFileSync(process.env.NT_ASSIST_BINARY, ['--assist-op'], { input: JSON.stringify({ operation, document, payload }), encoding: 'utf8' })) as T;
}
function words(r: () => number, count: number, spanMs: number): NonNullable<TimelineClip['caption']>['words'] {
  const step = spanMs / count;
  return Array.from({ length: count }, (_, i) => {
    const start = Math.round(i * step);
    return { word: `w${i}`, startMs: start, endMs: start + Math.round(step * (0.4 + r() * 0.5)) };
  });
}
function document(r: () => number): Doc {
  const tracks = (['video', 'audio', 'audio'] as const).map((type, index) => makeTrack({ id: `t${index}`, type, index }));
  const voice = [0, 1, 2].map(part => makeClip({ id: `voice${part}`, trackId: 't1', mediaType: 'audio', startMs: 1000 + part * 4000, durationMs: 3000, inPointMs: 500,
    caption: { words: words(r, 3 + Math.floor(r() * 6), 3000) } }));
  const others = [makeClip({ id: 'shot', trackId: 't0', mediaType: 'image', startMs: 500, durationMs: 9000 }), makeClip({ id: 'music', trackId: 't2', mediaType: 'audio', startMs: 14000, durationMs: 2000 })];
  return { id: 'sequence', fps: 30, width: 640, height: 360, durationMs: 20000, tracks, clips: [...voice, ...others], mediaTracks: [] };
}
function native(doc: Doc, payload: Record<string, unknown>): Doc {
  if (!process.env.NT_TARGETING_OPS) throw new Error('NT_TARGETING_OPS is required');
  const result = JSON.parse(execFileSync(process.env.NT_TARGETING_OPS, [], { input: JSON.stringify({ action: 'removeRange', doc, payload }), encoding: 'utf8' }));
  if (result.error) throw new Error(result.error);
  return result as Doc;
}
function web(doc: Doc, startMs: number, endMs: number, ripple: boolean, untargeted: string[], syncOff: string[]): Doc {
  const store = createTimelineStore();
  store.setState({ ...structuredClone(doc), linkedSelection: true, untargetedTrackIds: new Set(untargeted), syncLockOffTrackIds: new Set(syncOff) });
  store.getState().removeRange(startMs, endMs, ripple);
  const { clips, mediaTracks } = store.getState();
  return { ...doc, clips, mediaTracks: mediaTracks as never[] };
}
function references(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(references);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'clipId' || key === 'trackId' ? { id: item } : references(item)]));
  }
  return value;
}

describe('text panel against the web editor', () => {
  it('reads the same words in the same order as the web transcript', () => {
    const r = rng(1);
    for (let i = 0; i < 40; i++) {
      const doc = document(r);
      const expected = buildTranscriptDoc(doc.clips).segments.flatMap(segment => segment.tokens).map(token => ({ clipId: token.clipId, wordIndex: token.wordIndex, text: token.text, startMs: token.startMs, endMs: token.endMs }));
      expect(expected.length).toBeGreaterThan(0);
      expect(oracle<{ words: unknown[] }>('transcriptWords', doc).words).toEqual(expected);
    }
  });
  it('marks the web selection range, snapped outward to frames', () => {
    const r = rng(2);
    for (let i = 0; i < 40; i++) {
      const doc = document(r);
      const flat = buildTranscriptDoc(doc.clips).segments.flatMap(segment => segment.tokens);
      const first = Math.floor(r() * flat.length);
      const last = Math.min(flat.length - 1, first + Math.floor(r() * 5));
      const range = resolveSelectionRange(buildTranscriptDoc(doc.clips), { clipId: flat[first].clipId, wordIndex: flat[first].wordIndex }, { clipId: flat[last].clipId, wordIndex: flat[last].wordIndex });
      const span = oracle<{ startMs: number; endMs: number }>('transcriptSpan', doc, { first, last });
      const frame = 1000 / doc.fps;
      expect(span.startMs).toBeCloseTo(Math.floor(range!.startMs / frame + 1e-6) * frame, 6);
      expect(span.endMs).toBeCloseTo(Math.max(Math.floor(range!.startMs / frame + 1e-6) + 1, Math.ceil(range!.endMs / frame - 1e-6)) * frame, 6);
    }
  });
  for (const ripple of [false, true]) {
    it(`${ripple ? 'extract' : 'lift'} of a word selection matches the web range edit`, () => {
      const r = rng(ripple ? 3 : 4);
      let wordsChanged = 0;
      for (let i = 0; i < 120; i++) {
        const doc = document(r);
        const count = buildTranscriptDoc(doc.clips).segments.flatMap(segment => segment.tokens).length;
        const first = Math.floor(r() * count);
        const last = Math.min(count - 1, first + Math.floor(r() * 6));
        const span = oracle<{ startMs: number; endMs: number }>('transcriptSpan', doc, { first, last });
        const untargeted = i % 3 === 0 ? ['t2'] : i % 3 === 1 ? ['t0', 't2'] : [];
        const syncOff = i % 2 === 0 ? ['t2'] : [];
        const expected = web(doc, span.startMs, span.endMs, ripple, untargeted, syncOff);
        const actual = native(doc, { startMs: span.startMs, endMs: span.endMs, ripple, untargetedTrackIds: untargeted, syncLockOffTrackIds: syncOff });
        const known = inputIds(references(doc));
        expect(normalize(references(actual), known), `case ${i}: ${JSON.stringify({ first, last, untargeted, syncOff })}`).toEqual(normalize(references(expected), known));
        expect(checkIds(actual.clips, doc.clips)).toEqual([]);
        const after = oracle<{ words: unknown[] }>('transcriptWords', actual).words;
        if (after.length < count) wordsChanged++;
      }
      expect(wordsChanged).toBeGreaterThan(100);
    });
  }
  it('splits cues as the web renderer does, with and without marks', () => {
    const r = rng(5);
    expect(CAPTION_CUE_GAP_MS).toBe(700);
    expect(CAPTION_CUE_MAX_WORDS).toBe(10);
    for (let i = 0; i < 80; i++) {
      let at = -300;
      const list = Array.from({ length: 2 + Math.floor(r() * 30) }, (_, n) => {
        const startMs = at + (r() < 0.2 ? 800 : 50);
        at = startMs + 100;
        const mark = r();
        return { word: `w${n}`, startMs, endMs: at, ...(mark < 0.1 ? { cue: 'start' as const } : mark < 0.2 ? { cue: 'continue' as const } : {}) };
      });
      const durationMs = 1500 + r() * 3000;
      const webCues = captionCues({ caption: { words: list }, durationMs }).map(cue => cue.map(word => list.indexOf(word)));
      expect(oracle<{ cues: number[][] }>('captionCues', {}, { words: list, durationMs }).cues).toEqual(webCues);
    }
  });
  it('keeps the cue mark through the document schema, which would strip an unknown field', () => {
    const caption = { words: [{ word: 'a', startMs: 0, endMs: 100 }, { word: 'b', startMs: 100, endMs: 200, cue: 'start' as const }] };
    expect(clipCaption.parse(caption)).toEqual(caption);
    expect(clipCaption.parse({ words: [{ word: 'a', startMs: 0, endMs: 100 }] })).toEqual({ words: [{ word: 'a', startMs: 0, endMs: 100 }] });
  });
  it('leaves caption edits that the web renderer and schema read as the same cues', () => {
    const base = document(rng(6));
    const clip = base.clips[0];
    const text = (doc: Doc) => captionCues(doc.clips[0]).map(cue => cue.map(word => word.word).join(' '));
    const cue = captionCues(clip)[0];
    const edit = { clipId: clip.id, firstWord: 0, wordCount: cue.length };
    expect(cue.length).toBeGreaterThan(1);
    const split = oracle<Doc>('captionEdit', base, { name: 'split', payload: { ...edit, atWord: 1 } });
    expect(text(split).slice(0, 2)).toEqual([cue[0].word, cue.slice(1).map(word => word.word).join(' ')]);
    const merged = oracle<Doc>('captionEdit', split, { name: 'merge', payload: { clipId: clip.id, firstWord: 0, wordCount: 1 } });
    expect(merged.clips[0].caption).toEqual(clip.caption);
    const retext = oracle<Doc>('captionEdit', base, { name: 'text', payload: { ...edit, text: 'a b c d e f g h i j k l m' } });
    expect(text(retext)[0]).toBe('a b c d e f g h i j k l m');
    const gone = oracle<Doc>('captionEdit', base, { name: 'delete', payload: edit });
    expect(text(gone)).toEqual(text(base).slice(1));
  });
});
