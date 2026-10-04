/**
 * Tests for the pure timeline edits.
 *
 * These carry the invariants the agent tools depend on, so they are exercised
 * directly rather than through the screen: link groups that must not desync,
 * staleness on a binding change, transcript references that must not dangle,
 * and track ids that must never be a track *name*.
 */
import { makeClipVersion, type TimelineClip } from '@nodetool-ai/timeline';
import {
  addGroup,
  addMarker,
  addMediaClip,
  addShapeClip,
  addTextClip,
  addTrack,
  animateClip,
  clearAnimations,
  deleteClip,
  deleteMarker,
  duplicateClip,
  moveClip,
  setClipBinding,
  setClipParams,
  setEffects,
  setMarkersFromBeats,
  setMask,
  setMatte,
  setParent,
  setTimeRemap,
  setTransition,
  snapToBeats,
  splitClipAt,
  trimClip,
} from '../timelineEdits';
import type { TimelineDocument } from '../timelineTypes';
const clip = (overrides: Partial<TimelineClip>): TimelineClip => ({
  id: 'c',
  trackId: 't1',
  name: 'Clip',
  startMs: 0,
  durationMs: 1000,
  mediaType: 'video',
  sourceType: 'generated',
  status: 'draft',
  locked: false,
  versions: [],
  ...overrides,
});
const baseDoc = (): TimelineDocument => ({
  tracks: [
    {
      id: 't1',
      name: 'Video 1',
      type: 'video',
      index: 0,
      visible: true,
      locked: false,
    },
    {
      id: 't2',
      name: 'Music',
      type: 'audio',
      index: 1,
      visible: true,
      locked: false,
    },
    {
      id: 't3',
      name: 'Titles',
      type: 'overlay',
      index: 2,
      visible: true,
      locked: false,
    },
  ],
  clips: [
    clip({
      id: 'c1',
      trackId: 't1',
      name: 'Opening shot',
      startMs: 1000,
      durationMs: 4000,
    }),
    clip({
      id: 'c2',
      trackId: 't2',
      name: 'Theme',
      startMs: 0,
      durationMs: 8000,
      mediaType: 'audio',
      sourceType: 'imported',
    }),
  ],
  markers: [{ id: 'm1', timeMs: 2000, label: 'Cut' }],
});
/** A video clip and the audio extracted from it, aligned and linked. */
const linkedDoc = (): TimelineDocument => ({
  ...baseDoc(),
  clips: [
    clip({
      id: 'v',
      trackId: 't1',
      name: 'Interview',
      startMs: 2000,
      durationMs: 6000,
      linkId: 'L',
    }),
    clip({
      id: 'a',
      trackId: 't2',
      name: 'Interview audio',
      startMs: 2000,
      durationMs: 6000,
      mediaType: 'audio',
      linkId: 'L',
    }),
    clip({
      id: 'solo',
      trackId: 't1',
      name: 'Solo',
      startMs: 20000,
      durationMs: 1000,
    }),
  ],
});
const byId = (doc: TimelineDocument, id: string): TimelineClip => {
  const found = doc.clips.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`no clip ${id}`);
  }
  return found;
};
describe('addTrack', () => {
  it('appends a track with the next index and a default name', async () => {
    const next = await addTrack(baseDoc(), 'audio');
    expect(next.track).toMatchObject({
      type: 'audio',
      index: 3,
      name: 'audio 4',
    });
    expect(next.doc.tracks).toHaveLength(4);
  });
  it('leaves the input document untouched', async () => {
    const doc = baseDoc();
    await addTrack(doc, 'video', 'B-roll');
    expect(doc.tracks).toHaveLength(3);
  });
});
describe('addTextClip', () => {
  it('lands on the existing overlay track, appended after its content', async () => {
    const doc: TimelineDocument = {
      ...baseDoc(),
      clips: [
        ...baseDoc().clips,
        clip({
          id: 'x',
          trackId: 't3',
          startMs: 0,
          durationMs: 2500,
          mediaType: 'text',
        }),
      ],
    };
    const next = await addTextClip(doc, { text: '  Chapter One  ' });
    expect(next.clip).toMatchObject({
      trackId: 't3',
      name: 'Chapter One',
      startMs: 2500,
      durationMs: 3000,
      mediaType: 'text',
      status: 'generated',
    });
    expect(next.clip.textStyle).toMatchObject({
      text: 'Chapter One',
      fontSizePx: 96,
    });
  });
  it('creates an overlay track when the sequence has none', async () => {
    const doc: TimelineDocument = {
      ...baseDoc(),
      tracks: baseDoc().tracks.filter((track) => track.type !== 'overlay'),
    };
    const next = await addTextClip(doc, { text: 'Title' });
    const created = next.doc.tracks.find((track) => track.type === 'overlay');
    expect(created).toMatchObject({ name: 'Text' });
    expect(next.clip.trackId).toBe(created?.id);
  });
  it('resolves a track name to its id rather than writing the name', async () => {
    const next = await addTextClip(baseDoc(), {
      text: 'Title',
      trackId: 'titles',
    });
    expect(next.clip.trackId).toBe('t3');
  });
  it('refuses an audio track', async () => {
    await expect(
      addTextClip(baseDoc(), { text: 'Title', trackId: 'Music' }),
    ).rejects.toThrow(/require a video or overlay track; "Music" is audio/);
  });
  it('refuses a nonexistent track, naming the ones that exist', async () => {
    await expect(
      addTextClip(baseDoc(), { text: 'Title', trackId: 'nope' }),
    ).rejects.toThrow(/No track found matching "nope".*t1 \("Video 1"\)/s);
  });
  it('refuses empty text', async () => {
    await expect(addTextClip(baseDoc(), { text: '   ' })).rejects.toThrow(
      /non-empty text/,
    );
  });
  it('clamps a zero duration and a negative start to the bounds', async () => {
    const next = await addTextClip(baseDoc(), {
      text: 'Title',
      startMs: -500,
      durationMs: 0,
    });
    expect(next.clip).toMatchObject({ startMs: 0, durationMs: 1 });
  });
});
describe('addShapeClip', () => {
  it('fills a rectangle so it is visible', async () => {
    const next = await addShapeClip(baseDoc(), { shape: { kind: 'rect' } });
    expect(next.clip.shapeStyle).toMatchObject({
      kind: 'rect',
      fill: '#FFFFFF',
    });
    expect(next.clip.mediaType).toBe('shape');
  });
  it('strokes a line so it is visible', async () => {
    const next = await addShapeClip(baseDoc(), {
      shape: { kind: 'line', x2: 1, y2: 1 },
    });
    expect(next.clip.shapeStyle).toMatchObject({
      stroke: '#FFFFFF',
      strokeWidthPx: 8,
    });
  });
});
describe('moveClip', () => {
  it('moves an unlinked clip and resolves the target track by name', async () => {
    const next = await moveClip(baseDoc(), 'Opening shot', {
      startMs: 3000,
      trackId: 'titles',
    });
    expect(next.clips).toHaveLength(1);
    expect(byId(next.doc, 'c1')).toMatchObject({
      startMs: 3000,
      trackId: 't3',
    });
  });
  it('clamps a negative start to zero', async () => {
    const next = await moveClip(baseDoc(), 'c1', { startMs: -1000 });
    expect(byId(next.doc, 'c1').startMs).toBe(0);
  });
  it('rejects a move to a nonexistent track and changes nothing', async () => {
    const doc = baseDoc();
    await expect(
      moveClip(doc, 'c1', { startMs: 0, trackId: 'ghost' }),
    ).rejects.toThrow(/No track found matching "ghost"/);
    expect(byId(doc, 'c1').startMs).toBe(1000);
  });
  it('shifts every link sibling by the same delta, each keeping its own track', async () => {
    const next = await moveClip(linkedDoc(), 'v', {
      startMs: 5000,
      trackId: 'Titles',
    });
    expect(next.clips.map((entry) => entry.id).sort()).toEqual(['a', 'v']);
    expect(byId(next.doc, 'v')).toMatchObject({ startMs: 5000, trackId: 't3' });
    // Same delta, and the audio stays on the audio track.
    expect(byId(next.doc, 'a')).toMatchObject({ startMs: 5000, trackId: 't2' });
    expect(byId(next.doc, 'solo').startMs).toBe(20000);
  });
  it('clamps the delta once for the group so a move against zero keeps alignment', async () => {
    const doc = linkedDoc();
    // The audio sits 500ms ahead of the video, so the group cannot shift by more
    // than -1500 without pushing the audio before zero.
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'a' ? { ...entry, startMs: 1500 } : entry,
    );
    const next = await moveClip(doc, 'v', { startMs: 0 });
    expect(byId(next.doc, 'a').startMs).toBe(0);
    // The video keeps its 500ms offset instead of both piling onto zero.
    expect(byId(next.doc, 'v').startMs).toBe(500);
  });
});
describe('trimClip', () => {
  it('changes the on-timeline length and the source out-point together', async () => {
    const next = await trimClip(baseDoc(), 'c1', { durationMs: 2000 });
    expect(byId(next.doc, 'c1')).toMatchObject({
      durationMs: 2000,
      inPointMs: 0,
      outPointMs: 2000,
    });
  });
  it('maps the timeline delta through the clip speed', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1' ? { ...entry, speedMultiplier: 2 } : entry,
    );
    // Growing 1000ms of timeline consumes 2000ms of source at 2x.
    const next = await trimClip(doc, 'c1', { durationMs: 5000 });
    expect(byId(next.doc, 'c1').outPointMs).toBe(10000);
  });
  it('refuses a duration below 1ms', async () => {
    await expect(trimClip(baseDoc(), 'c1', { durationMs: 0 })).rejects.toThrow(
      /at least 1ms/,
    );
  });
  it('sets the source window on the target only', async () => {
    const next = await trimClip(linkedDoc(), 'v', {
      inPointMs: 500,
      outPointMs: 4000,
    });
    expect(byId(next.doc, 'v')).toMatchObject({
      inPointMs: 500,
      outPointMs: 4000,
    });
    expect(byId(next.doc, 'a').inPointMs).toBeUndefined();
  });
  it('refuses an inverted source window', async () => {
    await expect(
      trimClip(baseDoc(), 'c1', { inPointMs: 4000, outPointMs: 1000 }),
    ).rejects.toThrow(/must be greater than inPointMs/);
  });
  it('refuses a negative in-point', async () => {
    await expect(trimClip(baseDoc(), 'c1', { inPointMs: -1 })).rejects.toThrow(
      /cannot be negative/,
    );
  });
  it('refuses an empty patch', async () => {
    await expect(trimClip(baseDoc(), 'c1', {})).rejects.toThrow(
      /Nothing to trim/,
    );
  });
  it('applies the same length delta to every link sibling', async () => {
    const next = await trimClip(linkedDoc(), 'v', { durationMs: 4000 });
    expect(byId(next.doc, 'v').durationMs).toBe(4000);
    expect(byId(next.doc, 'a').durationMs).toBe(4000);
  });
  it('aborts the whole trim when a sibling would go invalid, so the link cannot desync', async () => {
    const doc = linkedDoc();
    // The audio has a source window with nothing left to reveal, so growing the
    // pair is invalid for the audio but fine for the video.
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'a' ? { ...entry, inPointMs: 0, outPointMs: 6000 } : entry,
    );
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'a' ? { ...entry, startMs: 0, durationMs: 6000 } : entry,
    );
    // Shrinking below zero duration is invalid for the audio (6000 - 7000 < 0)
    // while the video would merely shrink.
    await expect(trimClip(doc, 'v', { durationMs: -1000 })).rejects.toThrow();
    expect(byId(doc, 'v').durationMs).toBe(6000);
    expect(byId(doc, 'a').durationMs).toBe(6000);
  });
});
describe('splitClipAt', () => {
  it('cuts a clip in two, mapping the source in/out points', async () => {
    const next = await splitClipAt(baseDoc(), 'c1', 3000);
    expect(next.clips).toHaveLength(2);
    const [left, right] = next.clips;
    expect(left).toMatchObject({
      startMs: 1000,
      durationMs: 2000,
      outPointMs: 2000,
    });
    expect(right).toMatchObject({
      startMs: 3000,
      durationMs: 2000,
      inPointMs: 2000,
    });
    expect(next.doc.clips).toHaveLength(3);
  });
  it('refuses a split time outside the clip', async () => {
    await expect(splitClipAt(baseDoc(), 'c1', 1000)).rejects.toThrow(
      /outside clip "Opening shot"/,
    );
    await expect(splitClipAt(baseDoc(), 'c1', 9000)).rejects.toThrow(
      /outside clip/,
    );
  });
  it('drops the fades and transition an interior cut invalidates', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            fadeInMs: 200,
            fadeOutMs: 300,
            transitionIn: { type: 'crossfade' as const, durationMs: 400 },
          }
        : entry,
    );
    const [left, right] = (await splitClipAt(doc, 'c1', 3000)).clips;
    expect(left.fadeInMs).toBe(200);
    expect(left.fadeOutMs).toBeUndefined();
    expect(right.fadeInMs).toBeUndefined();
    expect(right.transitionIn).toBeUndefined();
    expect(right.fadeOutMs).toBe(300);
  });
  it('splits every link sibling and gives each side its own fresh link id', async () => {
    const next = await splitClipAt(linkedDoc(), 'v', 5000);
    expect(next.clips).toHaveLength(4);
    const lefts = next.clips.filter((entry) => entry.startMs === 2000);
    const rights = next.clips.filter((entry) => entry.startMs === 5000);
    expect(lefts).toHaveLength(2);
    expect(rights).toHaveLength(2);
    // One link id per side, and neither is the original — a 4-member group
    // would pair nothing with anything.
    expect(new Set(lefts.map((entry) => entry.linkId)).size).toBe(1);
    expect(new Set(rights.map((entry) => entry.linkId)).size).toBe(1);
    expect(lefts[0].linkId).not.toBe(rights[0].linkId);
    expect(lefts[0].linkId).not.toBe('L');
    expect(rights[0].linkId).not.toBe('L');
  });
  it('leaves the halves of an unlinked clip unlinked', async () => {
    const [left, right] = (await splitClipAt(baseDoc(), 'c1', 3000)).clips;
    expect(left.linkId).toBeUndefined();
    expect(right.linkId).toBeUndefined();
  });
  it('leaves a sibling that does not span the cut alone', async () => {
    const doc = linkedDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'a' ? { ...entry, startMs: 30000 } : entry,
    );
    const next = await splitClipAt(doc, 'v', 5000);
    expect(next.clips).toHaveLength(2);
    expect(byId(next.doc, 'a').startMs).toBe(30000);
  });
  it('partitions clip-local caption words at the cut', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            caption: {
              words: [
                { word: 'one', startMs: 0, endMs: 500 },
                { word: 'two', startMs: 2500, endMs: 3000 },
              ],
            },
          }
        : entry,
    );
    const [left, right] = (await splitClipAt(doc, 'c1', 3000)).clips;
    expect(left.caption?.words).toEqual([
      { word: 'one', startMs: 0, endMs: 500 },
    ]);
    // Rebased to the right half's own start.
    expect(right.caption?.words).toEqual([
      { word: 'two', startMs: 500, endMs: 1000 },
    ]);
  });
  it('partitions animations by role and refreshes the right-hand ids', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            animations: [
              {
                id: 'in-1',
                role: 'in' as const,
                preset: 'fade',
                durationMs: 300,
              },
              {
                id: 'out-1',
                role: 'out' as const,
                preset: 'fade',
                durationMs: 300,
              },
            ],
          }
        : entry,
    );
    const [left, right] = (await splitClipAt(doc, 'c1', 3000)).clips;
    expect(left.animations?.map((a) => a.role)).toEqual(['in']);
    expect(right.animations?.map((a) => a.role)).toEqual(['out']);
    expect(right.animations?.[0].id).not.toBe('out-1');
  });
  it('refuses to split a clip a transcript line owns, naming the line', async () => {
    const doc: TimelineDocument = {
      ...baseDoc(),
      transcript: [
        {
          id: 'line-1',
          text: 'And then we cut away.',
          beatStartMs: 0,
          clipIds: ['c1'],
        },
      ],
    };
    await expect(splitClipAt(doc, 'c1', 3000)).rejects.toThrow(
      /Cannot split clip c1: transcript line "And then we cut away\." \(line-1\) owns it/,
    );
  });
  it('refuses when a link sibling of the target is transcribed', async () => {
    const doc: TimelineDocument = {
      ...linkedDoc(),
      transcript: [
        { id: 'line-1', text: 'Spoken line.', beatStartMs: 0, clipIds: ['a'] },
      ],
    };
    await expect(splitClipAt(doc, 'v', 5000)).rejects.toThrow(
      /Cannot split clip a/,
    );
  });
});
describe('deleteClip', () => {
  it('removes the clip', async () => {
    const next = await deleteClip(baseDoc(), 'Opening shot');
    expect(next.deleted.id).toBe('c1');
    expect(next.doc.clips.map((entry) => entry.id)).toEqual(['c2']);
  });
  it('unlinks the survivor when the group drops below two members', async () => {
    const next = await deleteClip(linkedDoc(), 'v');
    expect(byId(next.doc, 'a').linkId).toBeUndefined();
  });
  it('keeps the link when two members remain', async () => {
    const doc = linkedDoc();
    doc.clips = [...doc.clips, clip({ id: 'a2', trackId: 't2', linkId: 'L' })];
    const next = await deleteClip(doc, 'v');
    expect(byId(next.doc, 'a').linkId).toBe('L');
    expect(byId(next.doc, 'a2').linkId).toBe('L');
  });
  it('refuses to delete a clip a transcript line owns', async () => {
    const doc: TimelineDocument = {
      ...baseDoc(),
      transcript: [
        { id: 'line-1', text: 'Spoken line.', beatStartMs: 0, clipIds: ['c1'] },
      ],
    };
    await expect(deleteClip(doc, 'c1')).rejects.toThrow(
      /Cannot delete clip c1/,
    );
    expect(doc.clips).toHaveLength(2);
  });
  it('resolves "selected"', async () => {
    const next = await deleteClip(baseDoc(), 'selected', ['c2']);
    expect(next.deleted.id).toBe('c2');
  });
  it('refuses "selected" when nothing is selected', async () => {
    await expect(deleteClip(baseDoc(), 'selected', [])).rejects.toThrow(
      /No clip is selected/,
    );
  });
});
describe('duplicateClip', () => {
  it('places the copy after the source and resets derived state', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            status: 'generated' as const,
            currentAssetId: 'asset-1',
            lastGeneratedHash: 'hash-1',
            locked: true,
            versions: [makeClipVersion({ assetId: 'asset-1' })],
            prompt: 'a fox in snow',
          }
        : entry,
    );
    const [copy] = (await duplicateClip(doc, 'c1', 250)).clips;
    expect(copy.startMs).toBe(5250);
    expect(copy.status).toBe('draft');
    expect(copy.currentAssetId).toBeUndefined();
    expect(copy.lastGeneratedHash).toBeUndefined();
    expect(copy.versions).toEqual([]);
    expect(copy.locked).toBe(false);
    // The binding survives, so the copy can be tweaked into a variation.
    expect(copy.prompt).toBe('a fox in snow');
    expect(copy.id).not.toBe('c1');
  });
  it('gives a lone copy no link id', async () => {
    const [copy] = (await duplicateClip(baseDoc(), 'c1')).clips;
    expect(copy.linkId).toBeUndefined();
  });
  it('duplicates a whole link group under one fresh shared link id', async () => {
    const next = await duplicateClip(linkedDoc(), 'v');
    expect(next.clips).toHaveLength(2);
    const [first, second] = next.clips;
    expect(first.linkId).toBe(second.linkId);
    expect(first.linkId).not.toBe('L');
    // Both shift by the primary's offset, so the group stays aligned.
    expect(first.startMs).toBe(8000);
    expect(second.startMs).toBe(8000);
  });
  it('gives the copy fresh animation ids', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            animations: [
              {
                id: 'in-1',
                role: 'in' as const,
                preset: 'fade',
                durationMs: 300,
              },
            ],
          }
        : entry,
    );
    const [copy] = (await duplicateClip(doc, 'c1')).clips;
    expect(copy.animations?.[0].id).not.toBe('in-1');
  });
});
describe('setClipParams', () => {
  it('writes only the fields the patch names', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1' ? { ...entry, prompt: 'keep me' } : entry,
    );
    const next = await setClipParams(doc, 'c1', { name: 'Renamed' });
    expect(next.clip).toMatchObject({ name: 'Renamed', prompt: 'keep me' });
  });
  it('clamps opacity and speed to their ranges', async () => {
    const next = await setClipParams(baseDoc(), 'c1', {
      opacity: 4,
      speedMultiplier: 100,
      fadeInMs: -5,
    });
    expect(next.clip).toMatchObject({
      opacity: 1,
      speedMultiplier: 8,
      fadeInMs: 0,
    });
  });
  it('marks a generated clip stale when a binding field changes', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? {
            ...entry,
            status: 'generated' as const,
            currentAssetId: 'asset-1',
            prompt: 'old prompt',
          }
        : entry,
    );
    const next = await setClipParams(doc, 'c1', { prompt: 'new prompt' });
    expect(next.clip).toMatchObject({ prompt: 'new prompt', status: 'stale' });
  });
  it('marks stale on a lastGeneratedHash alone', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? { ...entry, status: 'failed' as const, lastGeneratedHash: 'hash-1' }
        : entry,
    );
    expect(
      (await setClipParams(doc, 'c1', { model: 'flux' })).clip.status,
    ).toBe('stale');
  });
  it('leaves a never-generated clip a draft', async () => {
    const next = await setClipParams(baseDoc(), 'c1', {
      prompt: 'first prompt',
    });
    expect(next.clip.status).toBe('draft');
  });
  it('does not mark stale for a non-binding change', async () => {
    const doc = baseDoc();
    doc.clips = doc.clips.map((entry) =>
      entry.id === 'c1'
        ? { ...entry, status: 'generated' as const, currentAssetId: 'asset-1' }
        : entry,
    );
    expect((await setClipParams(doc, 'c1', { muted: true })).clip.status).toBe(
      'generated',
    );
  });
  it('refuses a binding field on an imported clip', async () => {
    await expect(
      setClipParams(baseDoc(), 'Theme', { prompt: 'nope' }),
    ).rejects.toThrow(/not a generated clip/);
  });
  it('refuses textStyle on a non-text clip and shapeStyle on a non-shape clip', async () => {
    await expect(
      setClipParams(baseDoc(), 'c1', {
        textStyle: { text: 'hi', fontSizePx: 40, color: '#fff' },
      }),
    ).rejects.toThrow(/textStyle applies only to text clips/);
    await expect(
      setClipParams(baseDoc(), 'c1', { shapeStyle: { kind: 'rect' } }),
    ).rejects.toThrow(/shapeStyle applies only to shape clips/);
  });
  it('fills a shape style default when patching a shape clip', async () => {
    const doc = baseDoc();
    doc.clips = [
      ...doc.clips,
      clip({ id: 's1', trackId: 't3', name: 'Box', mediaType: 'shape' }),
    ];
    const next = await setClipParams(doc, 's1', {
      shapeStyle: { kind: 'rect' },
    });
    expect(next.clip.shapeStyle).toMatchObject({
      kind: 'rect',
      fill: '#FFFFFF',
    });
  });
});
describe('markers', () => {
  it('adds a marker with an id', async () => {
    const next = await addMarker(baseDoc(), { timeMs: 4500, label: 'Beat' });
    expect(next.marker).toMatchObject({ timeMs: 4500, label: 'Beat' });
    expect(next.marker.id).toBeTruthy();
    expect(next.doc.markers).toHaveLength(2);
  });
  it('refuses a marker before zero', async () => {
    await expect(addMarker(baseDoc(), { timeMs: -1 })).rejects.toThrow(
      /before zero/,
    );
  });
  it('deletes by id or by case-insensitive label', async () => {
    expect((await deleteMarker(baseDoc(), 'm1')).doc.markers).toEqual([]);
    expect((await deleteMarker(baseDoc(), 'cut')).deleted.id).toBe('m1');
  });
  it('names the markers that exist when the target misses', async () => {
    await expect(deleteMarker(baseDoc(), 'nope')).rejects.toThrow(
      /No marker matches "nope".*m1 \("Cut"\)/s,
    );
  });
});
// ── Groups ──────────────────────────────────────────────────────────────────
/** A group with one child on its own track, plus an unrelated clip. */
const groupedDoc = (): TimelineDocument => ({
  ...baseDoc(),
  clips: [
    clip({
      id: 'g',
      trackId: 't3',
      name: 'Title block',
      startMs: 1000,
      durationMs: 4000,
      mediaType: 'group',
      sourceType: 'imported',
    }),
    clip({
      id: 'child',
      trackId: 't1',
      name: 'Card',
      startMs: 2000,
      durationMs: 1000,
      parentId: 'g',
    }),
    clip({
      id: 'loose',
      trackId: 't1',
      name: 'Loose',
      startMs: 6000,
      durationMs: 1000,
    }),
  ],
});
describe('addGroup', () => {
  it('creates a group clip and parents the named children', async () => {
    const next = await addGroup(baseDoc(), {
      name: 'Title block',
      startMs: 0,
      durationMs: 3000,
      children: ['Opening shot'],
    });
    expect(next.clip.mediaType).toBe('group');
    expect(next.children).toEqual(['c1']);
    expect(next.doc.clips.find((c) => c.id === 'c1')?.parentId).toBe(
      next.clip.id,
    );
    // It lands on an overlay track rather than creating one, since t3 exists.
    expect(next.clip.trackId).toBe('t3');
  });
  it('resolves every child before writing anything', async () => {
    const doc = baseDoc();
    await expect(
      addGroup(doc, {
        name: 'G',
        startMs: 0,
        durationMs: 1000,
        children: ['c1', 'nope'],
      }),
    ).rejects.toThrow(/No clip found matching "nope"/);
    expect(doc.clips.some((c) => c.mediaType === 'group')).toBe(false);
  });
});
describe('setParent', () => {
  it('parents a clip to a group and releases it with null', async () => {
    const parented = await setParent(groupedDoc(), 'loose', 'Title block');
    expect(parented.clip.parentId).toBe('g');
    const released = await setParent(parented.doc, 'loose', null);
    expect(released.clip.parentId).toBeUndefined();
  });
  it('refuses a non-group parent', async () => {
    await expect(setParent(groupedDoc(), 'loose', 'child')).rejects.toThrow(
      /not a group/,
    );
  });
  it('refuses a cycle between two groups', async () => {
    const outer = groupedDoc();
    const doc: TimelineDocument = {
      ...outer,
      clips: [
        ...outer.clips,
        clip({
          id: 'inner',
          trackId: 't3',
          name: 'Inner',
          mediaType: 'group',
          sourceType: 'imported',
          parentId: 'g',
        }),
      ],
    };
    // `inner` is under `g`, so parenting `g` to `inner` would close the loop.
    await expect(setParent(doc, 'g', 'inner')).rejects.toThrow(/cycle/);
  });
});
describe('group-aware move, trim and delete', () => {
  it("moveClip carries a group's descendants with it", async () => {
    const next = await moveClip(groupedDoc(), 'g', { startMs: 3000 });
    const byId = new Map(next.doc.clips.map((c) => [c.id, c]));
    expect(byId.get('g')?.startMs).toBe(3000);
    expect(byId.get('child')?.startMs).toBe(4000);
    // A clip outside the group does not move.
    expect(byId.get('loose')?.startMs).toBe(6000);
    expect(next.clips.map((c) => c.id).sort()).toEqual(['child', 'g']);
  });
  it('moveClip keeps a child on its own track when the group changes track', async () => {
    const next = await moveClip(groupedDoc(), 'g', { trackId: 'Video 1' });
    const byId = new Map(next.doc.clips.map((c) => [c.id, c]));
    expect(byId.get('g')?.trackId).toBe('t1');
    expect(byId.get('child')?.trackId).toBe('t1');
  });
  it("trimClip pulls a group's children inside the shorter window", async () => {
    // 1000..5000 becomes 1000..2500, so the child at 2000..3000 is trimmed.
    const next = await trimClip(groupedDoc(), 'g', { durationMs: 1500 });
    const byId = new Map(next.doc.clips.map((c) => [c.id, c]));
    expect(byId.get('g')?.durationMs).toBe(1500);
    expect(
      byId.get('child')!.startMs + byId.get('child')!.durationMs,
    ).toBeLessThanOrEqual(2500);
  });
  it('trimClip refuses source in/out points on a group', async () => {
    await expect(trimClip(groupedDoc(), 'g', { inPointMs: 0 })).rejects.toThrow(
      /carry no source media/,
    );
  });
  it("deleteClip releases a group's children instead of orphaning them", async () => {
    const next = await deleteClip(groupedDoc(), 'g');
    expect(next.doc.clips.some((c) => c.id === 'g')).toBe(false);
    const child = next.doc.clips.find((c) => c.id === 'child');
    expect(child).toBeDefined();
    expect(child?.parentId).toBeUndefined();
  });
});
// ── Motion, compositing, beats ──────────────────────────────────────────────
describe('animateClip', () => {
  it('attaches a preset animation and replaces by default', async () => {
    const first = await animateClip(baseDoc(), 'c1', [
      { role: 'in', preset: 'fade' },
    ]);
    expect(first.clip.animations).toHaveLength(1);
    expect(first.clip.animations?.[0]).toMatchObject({
      role: 'in',
      preset: 'fade',
    });
    expect(first.clip.animations?.[0].durationMs).toBeGreaterThan(0);
    const replaced = await animateClip(first.doc, 'c1', [
      { role: 'out', preset: 'fade' },
    ]);
    expect(replaced.clip.animations).toHaveLength(1);
    const added = await animateClip(
      replaced.doc,
      'c1',
      [{ role: 'in', preset: 'fade' }],
      'add',
    );
    expect(added.clip.animations).toHaveLength(2);
  });
  it('refuses an unknown preset and a role the preset does not take', async () => {
    await expect(
      animateClip(baseDoc(), 'c1', [{ role: 'in', preset: 'nope' }]),
    ).rejects.toThrow(/Unknown animation preset "nope"/);
    await expect(
      animateClip(baseDoc(), 'c1', [{ role: 'loop', preset: 'fade' }]),
    ).rejects.toThrow(/does not support role "loop"/);
  });
  it('takes custom curves and refuses a code body, naming the headless tool', async () => {
    const custom = await animateClip(baseDoc(), 'c1', [
      {
        role: 'in',
        preset: 'custom',
        curves: [
          {
            property: 'opacity',
            keyframes: [
              { t: 0, value: 0 },
              { t: 1, value: 1 },
            ],
          },
        ],
      },
    ]);
    expect(custom.clip.animations?.[0].custom?.curves).toHaveLength(1);
    await expect(
      animateClip(baseDoc(), 'c1', [
        { role: 'in', preset: 'custom', code: 'return {};' },
      ]),
    ).rejects.toThrow(/edit_timeline/);
  });
  it('leaves the clip untouched when one animation of a list is invalid', async () => {
    const doc = baseDoc();
    await expect(
      animateClip(doc, 'c1', [
        { role: 'in', preset: 'fade' },
        { role: 'in', preset: 'nope' },
      ]),
    ).rejects.toThrow();
    expect(doc.clips.find((c) => c.id === 'c1')?.animations).toBeUndefined();
  });
});
describe('clearAnimations', () => {
  it('clears one role or all of them', async () => {
    const animated = await animateClip(baseDoc(), 'c1', [
      { role: 'in', preset: 'fade' },
      { role: 'out', preset: 'fade' },
    ]);
    const oneRole = await clearAnimations(animated.doc, 'c1', 'in');
    expect(oneRole.clip.animations?.map((a) => a.role)).toEqual(['out']);
    expect((await clearAnimations(oneRole.doc, 'c1')).clip.animations).toEqual(
      [],
    );
  });
});
describe('setTransition, setMask, setMatte, setEffects', () => {
  it('keeps only the fields the transition type uses', async () => {
    const wipe = await setTransition(baseDoc(), 'c1', {
      type: 'wipe',
      durationMs: 500,
      direction: 'up',
      color: '#ff0000',
    });
    expect(wipe.clip.transitionIn).toEqual({
      type: 'wipe',
      durationMs: 500,
      direction: 'up',
    });
    expect(
      (await setTransition(wipe.doc, 'c1', null)).clip.transitionIn,
    ).toBeUndefined();
  });
  it('refuses an unknown transition type', async () => {
    await expect(
      setTransition(baseDoc(), 'c1', { type: 'melt', durationMs: 100 }),
    ).rejects.toThrow(/Invalid option/);
  });
  it('keeps only the fields the mask kind uses and needs `d` for a path', async () => {
    const rect = await setMask(baseDoc(), 'c1', {
      kind: 'rect',
      x: 0.1,
      width: 0.5,
      d: 'M0 0',
    });
    expect(rect.clip.mask).toEqual({ kind: 'rect', x: 0.1, width: 0.5 });
    await expect(setMask(baseDoc(), 'c1', { kind: 'path' })).rejects.toThrow(
      /needs `d`/,
    );
    await expect(setMask(baseDoc(), 'c1', { kind: 'blob' })).rejects.toThrow(
      /rect/,
    );
  });
  it('resolves the matte source by name and refuses the clip itself', async () => {
    const matte = await setMatte(baseDoc(), 'c1', {
      source: 'Theme',
      mode: 'luma',
    });
    expect(matte.clip.matte).toEqual({ sourceClipId: 'c2', mode: 'luma' });
    await expect(
      setMatte(baseDoc(), 'c1', { source: 'c1', mode: 'alpha' }),
    ).rejects.toThrow(/its own matte source/);
  });
  it('replaces the whole effect chain and clears it with an empty list', async () => {
    const chain = await setEffects(baseDoc(), 'c1', [
      { type: 'blur', radius: 6 },
      { type: 'vignette' },
    ]);
    expect(chain.clip.effects).toEqual([
      { id: 'fx-1', enabled: true, type: 'blur', radius: 6 },
      {
        id: 'fx-2',
        enabled: true,
        type: 'vignette',
        amount: 0.5,
        softness: 0.5,
      },
    ]);
    expect(
      (await setEffects(chain.doc, 'c1', [])).clip.effects,
    ).toBeUndefined();
    await expect(
      setEffects(baseDoc(), 'c1', [{ type: 'sparkle' }]),
    ).rejects.toThrow(/blur/);
  });
});
describe('setTimeRemap', () => {
  it('stores a curve that spans the clip and ascends', async () => {
    const next = await setTimeRemap(baseDoc(), 'c1', {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 0.5, sourceMs: 3000, easing: 'easeIn' },
        { t: 1, sourceMs: 4000 },
      ],
    });
    expect(next.clip.timeRemap?.keyframes).toHaveLength(3);
    expect(next.clip.timeRemap?.keyframes[0]).toEqual({ t: 0, sourceMs: 0 });
    expect(
      (await setTimeRemap(next.doc, 'c1', null)).clip.timeRemap,
    ).toBeUndefined();
  });
  it('refuses a curve that does not span the clip, or does not ascend', async () => {
    await expect(
      setTimeRemap(baseDoc(), 'c1', {
        keyframes: [
          { t: 0.3, sourceMs: 0 },
          { t: 1, sourceMs: 100 },
        ],
      }),
    ).rejects.toThrow(/must span the clip/);
    await expect(
      setTimeRemap(baseDoc(), 'c1', {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0, sourceMs: 100 },
          { t: 1, sourceMs: 200 },
        ],
      }),
    ).rejects.toThrow(/must ascend in t/);
    await expect(
      setTimeRemap(baseDoc(), 'c1', { keyframes: [{ t: 0, sourceMs: 0 }] }),
    ).rejects.toThrow(/2 items/);
  });
});
describe('setClipBinding', () => {
  it('marks a rendered clip stale and refuses an imported one', async () => {
    const doc = baseDoc();
    doc.clips[0] = {
      ...doc.clips[0],
      currentAssetId: 'asset-1',
      status: 'generated',
    };
    const next = await setClipBinding(doc, 'c1', { prompt: 'a fox at dawn' });
    expect(next.clip.prompt).toBe('a fox at dawn');
    expect(next.clip.status).toBe('stale');
    // c2 is imported.
    await expect(setClipBinding(doc, 'c2', { prompt: 'x' })).rejects.toThrow(
      /not a generated clip/,
    );
    await expect(setClipBinding(doc, 'c1', {})).rejects.toThrow(
      /Nothing to set/,
    );
  });
});
describe('beats', () => {
  it('setMarkersFromBeats lays one marker per beat and re-runs idempotently', async () => {
    const first = await setMarkersFromBeats(baseDoc(), { bpm: 120, count: 4 });
    expect(first.report.grid.count).toBe(4);
    expect(first.report.added).toHaveLength(4);
    expect(first.report.added[0].label).toBe('Beat 1');
    // The pre-existing marker survives.
    expect(first.doc.markers).toHaveLength(5);
    const again = await setMarkersFromBeats(first.doc, { bpm: 120, count: 4 });
    expect(again.report.added).toHaveLength(0);
    expect(again.report.skippedTimesMs).toHaveLength(4);
    expect(again.doc.markers).toHaveLength(5);
  });
  it('snapToBeats moves a clip onto a beat and leaves a far one alone', async () => {
    const doc: TimelineDocument = {
      ...baseDoc(),
      clips: [
        clip({ id: 'near', trackId: 't1', startMs: 1020, durationMs: 500 }),
        clip({ id: 'far', trackId: 't1', startMs: 3400, durationMs: 500 }),
      ],
    };
    const next = await snapToBeats(doc, { onsetsMs: [0, 1000, 2000, 3000] });
    const byId = new Map(next.doc.clips.map((c) => [c.id, c]));
    expect(byId.get('near')?.startMs).toBe(1000);
    // 3400 is 400ms from the nearest beat, past the 60ms default tolerance.
    expect(byId.get('far')?.startMs).toBe(3400);
    expect(next.report.snapped).toBe(1);
    expect(next.report.skipped).toBe(1);
    expect(next.report.clips.map((entry) => entry.clipName)).toEqual([
      'Clip',
      'Clip',
    ]);
  });
  it('snapToBeats reports a name nothing matched as a skip in the same list', async () => {
    const next = await snapToBeats(baseDoc(), {
      targets: ['c1', 'ghost'],
      onsetsMs: [0, 1000],
    });
    const ghost = next.report.clips.find((entry) => entry.clipId === 'ghost');
    expect(ghost?.snapped).toBe(false);
    expect(ghost?.reason).toMatch(/no clip matches "ghost"/);
    expect(next.report.skipped).toBeGreaterThanOrEqual(1);
  });
});
describe('addMediaClip', () => {
  const asset = {
    id: 'asset-9',
    name: 'b-roll.mp4',
    contentType: 'video/mp4',
    durationMs: 2500,
  };
  it('places the asset on a track for its media kind, appending by default', async () => {
    const next = await addMediaClip(baseDoc(), { asset: 'asset-9' }, asset);
    expect(next.clip).toMatchObject({
      mediaType: 'video',
      sourceType: 'imported',
      status: 'generated',
      currentAssetId: 'asset-9',
      name: 'b-roll.mp4',
      durationMs: 2500,
      trackId: 't1',
    });
    // Appended after the existing clip on t1 (1000 + 4000).
    expect(next.clip.startMs).toBe(5000);
  });
  it('refuses an asset that is not video, image, or audio', async () => {
    await expect(
      addMediaClip(
        baseDoc(),
        { asset: 'a' },
        { ...asset, contentType: 'text/csv' },
      ),
    ).rejects.toThrow(/not video, image, or audio/);
  });
});

describe('mobile creation bounds', () => {
  it('clamps shape and media timing', async () => {
    const shape = await addShapeClip(baseDoc(), {
      shape: { kind: 'rect' },
      startMs: -100,
      durationMs: 0,
    });
    const media = await addMediaClip(
      baseDoc(),
      { asset: 'asset-9', startMs: -100, durationMs: 0 },
      { id: 'asset-9', name: 'B-roll.mp4', contentType: 'video/mp4' },
    );
    expect(shape.clip).toMatchObject({ startMs: 0, durationMs: 1 });
    expect(media.clip).toMatchObject({ startMs: 0, durationMs: 1 });
  });
  it('requires a nonempty group name and positive duration', async () => {
    const doc = baseDoc();
    const before = structuredClone(doc);
    await expect(
      addGroup(doc, { name: '  ', startMs: 0, durationMs: 1000 }),
    ).rejects.toThrow('A group needs a name');
    await expect(
      addGroup(doc, { name: 'G', startMs: 0, durationMs: 0 }),
    ).rejects.toThrow('durationMs must be at least 1ms');
    expect(doc).toEqual(before);
  });
  it('normalizes a valid group name and start', async () => {
    expect(
      (
        await addGroup(baseDoc(), {
          name: '  Group  ',
          startMs: -100,
          durationMs: 1000,
        })
      ).clip,
    ).toMatchObject({ name: 'Group', startMs: 0 });
  });
});
