import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DocumentOp } from '@nodetool-ai/protocol';
import type { TimelineClip, TimelineTrack } from '../../../../../packages/timeline/src/types';
import { mergeTimelineDocuments, type TimelineMergeDoc } from '../../../../../web/src/stores/timeline/merge';
import { timelineMergeDocumentOf, timelineMergeDocumentOfSequence } from '../../../../../web/src/hooks/timeline/timelineExternalMerge';

const track = (id: string, index = 0): TimelineTrack => ({
  id, name: `Track ${id}`, type: 'video', index, visible: true, locked: false
});
const clip = (id: string, trackId = 't', startMs = 0): TimelineClip => ({
  id, name: `Clip ${id}`, mediaType: 'video', sourceType: 'imported', trackId, startMs, durationMs: 1000,
  inPointMs: 0, currentAssetId: `asset-${id}`, status: 'generated', locked: false, versions: [],
  transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
});
const baseDocument = (): TimelineMergeDoc => ({
  tracks: [track('t'), track('u', 1)], trackFolders: [{ id: 'folder', name: 'Folder' }],
  clips: [clip('a'), clip('b', 'u', 1000)],
  markers: [{ id: 'marker', timeMs: 250, name: 'Beat', color: '#ff0000' }],
  mediaTracks: [{ id: 'media', clipId: 'a', name: 'Actor', kind: 'point', sourceAssetId: 'asset-a',
    sourceStartMs: 0, sourceEndMs: 1000, samples: [], status: 'ready' }],
  transcript: [{ id: 'line', text: 'Hello', beatStartMs: 0, clipIds: ['a'] }],
  scriptEnabled: false, fps: 30, width: 1920, height: 1080, camera2d: null, setup: null
});
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const tempo = (bpm: number) => ({ bpm, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } });
const op = (tool: string, input: Record<string, unknown> = {}): DocumentOp => ({ tool, input });

interface Fixture {
  name: string;
  base: TimelineMergeDoc;
  draft: TimelineMergeDoc;
  server: TimelineMergeDoc;
  ops?: DocumentOp[];
  mergeWithoutOps?: boolean;
}
const fixtures: Fixture[] = [];
function fixture(name: string, mutate: (draft: TimelineMergeDoc, server: TimelineMergeDoc, base: TimelineMergeDoc) => void,
                 ops?: DocumentOp[], mergeWithoutOps = false): void {
  const base = baseDocument();
  const draft = clone(base);
  const server = clone(base);
  mutate(draft, server, base);
  fixtures.push({ name, base, draft, server, ops, mergeWithoutOps });
}
const editClips = (draft: TimelineMergeDoc, server: TimelineMergeDoc) => {
  draft.clips = [{ ...clip('a'), name: 'Local' }, clip('b', 'u')];
  server.clips = [{ ...clip('a'), name: 'External' }, { ...clip('b', 'u'), name: 'External B' }];
};

fixture('disjoint edits', (d, s) => {
  d.clips = [{ ...clip('a'), name: 'Local' }, clip('b', 'u', 1000)];
  s.clips = [clip('a'), { ...clip('b', 'u', 1000), durationMs: 2500 }];
}, [op('ui_timeline_update_clip', { clip_id: 'b' })]);
fixture('same-clip edits', editClips, [op('ui_timeline_update_clip', { clip_id: ['a', 'b'] })]);
fixture('external deletes dirty and untouched clips', (d, s) => {
  d.clips = [{ ...clip('a'), name: 'Local' }, clip('b', 'u', 1000)];
  s.clips = [];
}, [op('ui_timeline_delete_clip', { clip_id: ['a', 'b'] })]);
fixture('draft deletes server-edited clip', (d, s) => {
  d.clips = [clip('b', 'u', 1000)];
  s.clips = [{ ...clip('a'), name: 'External' }, clip('b', 'u', 1000)];
}, [op('ui_timeline_update_clip', { id: 'a' })]);
fixture('adds on both sides preserve server insertion order', (d, s) => {
  d.clips = [clip('b', 'u'), clip('local'), clip('a')];
  s.clips = [clip('new0'), clip('a'), clip('new2'), clip('b', 'u'), clip('new4')];
}, [op('ui_timeline_add_clip')]);
fixture('same-id adds contest', (d, s) => {
  d.clips.push({ ...clip('new'), name: 'Local' });
  s.clips.push({ ...clip('new'), name: 'External' });
}, [op('ui_timeline_add_clip', { id: 'new' })]);
fixture('track add', (d, s) => { d.fps = 24; s.tracks.push(track('new', 2)); }, [op('ui_timeline_add_track')]);
fixture('track delete', (d, s) => { d.fps = 24; s.tracks = [track('t')]; s.clips = [clip('a')]; }, [op('ui_timeline_delete_track', { trackId: 'u' })]);
fixture('track rename', (d, s) => { d.fps = 24; s.tracks = [{ ...track('t'), name: 'Renamed' }, track('u', 1)]; }, [op('ui_timeline_update_track', { trackId: 't' })]);
fixture('dangling clip on draft-deleted track', (d, s) => {
  d.tracks = [track('t')]; d.clips = [clip('a')]; s.clips.push(clip('new', 'u'));
}, [op('ui_timeline_add_clip', { id: 'new' })]);
fixture('dangling replaces a deleted conflict', (d, s) => {
  d.tracks = []; d.clips = [{ ...clip('a'), name: 'Local' }]; s.clips = [];
}, [op('ui_timeline_delete_clip', { id: 'a' })]);
fixture('conflicts without ops replace whole document', editClips);
fixture('empty ops replace whole document', editClips, []);
fixture('without ops even unchanged documents are replaced', () => {});
fixture('mergeWithoutOps merges by diff', editClips, undefined, true);
fixture('mergeWithoutOps with empty ops', editClips, [], true);
fixture('scalar edits fps and tempo', (d, s) => { d.fps = 24; s.tempo = tempo(120); }, undefined, true);
fixture('scalar contests', (d, s) => { d.fps = 24; s.fps = 60; d.width = 640; s.width = 1280; }, undefined, true);
fixture('tempo and master omitted by server fall back to base', (d, s, b) => {
  b.tempo = tempo(90); b.master = { volumeDb: -6 };
  d.tempo = tempo(120); d.master = { volumeDb: -3 };
  s.fps = 60;
}, undefined, true);
fixture('setup materializations dimensions and scriptEnabled', (d, s) => {
  d.fps = 24; s.width = 1280; s.height = 720; s.scriptEnabled = true;
  s.storyboardMaterializations = [{ boardId: 'board', elementKeys: ['shot'] }];
  s.setup = { stage: 'review', brief: 'A short product film' };
}, undefined, true);
for (const key of ['clip_id', 'clipId', 'id', 'target']) {
  fixture(`op scoping by ${key}`, editClips, [op('ui_timeline_update_clip', { [key]: 'a' })]);
}
fixture('op scoping by trackId does not contest clip drift', editClips, [op('ui_timeline_update_track', { trackId: 't' })]);
fixture('op own kind track wins over clip in verb', editClips, [op('ui_timeline_move_clip_to_track', { id: 'a' })]);
fixture('op unknown verb with id addresses all collection kinds', editClips, [op('ui_timeline_unknown', { id: 'a' })]);
fixture('op unknown verb without id addresses every collection', editClips, [op('ui_timeline_unknown', { provider: 'a', overrides: 'b' })]);
fixture('op id arrays ignore non-strings and empties', editClips, [op('ui_timeline_update_clip', { clip_id: ['', null, 2, 'a'] })]);
fixture('bind_to_track touches all clips', editClips, [op('ui_timeline_bind_to_track', { trackId: 't' })]);
fixture('unbind_track touches all clips', editClips, [op('ui_timeline_unbind_track')]);
fixture('delete_track_object touches media track and every clip', (d, s) => {
  editClips(d, s); d.mediaTracks = [{ id: 'media', name: 'Local' }]; s.mediaTracks = [{ id: 'media', name: 'External' }];
}, [op('ui_timeline_delete_track_object', { trackId: 'media' })]);
fixture('delete_track_object without id touches all media tracks', editClips, [op('ui_timeline_delete_track_object')]);
fixture('all collections merge atomically', (d, s) => {
  d.trackFolders = [{ id: 'folder', name: 'Local' }]; s.trackFolders = [{ id: 'folder', name: 'External' }];
  d.markers = []; s.markers = [{ id: 'marker', name: 'Edited', timeMs: 500 }];
  d.transcript = [{ id: 'line', text: 'Local' }]; s.transcript = [{ id: 'line', text: 'External' }, { id: 'new', text: 'New' }];
  d.mediaTracks = []; s.mediaTracks = [{ id: 'new', name: 'Actor' }];
}, undefined, true);
fixture('duplicate ids follow JavaScript Map order and last value', (d, s) => {
  d.clips = [clip('b', 'u'), clip('a'), { ...clip('b', 'u'), name: 'Last' }];
  s.clips = [clip('new'), clip('a'), clip('new', 't', 1000)];
}, [op('ui_timeline_update_clip')]);
fixture('camera parse strips nested unknown keys', (d, s) => {
  d.fps = 24;
  Object.assign(s, { camera2d: {
    position: { x: 10, y: 20, ignored: 3 }, depthPx: 0, focalLengthPx: 800, focusDepthPx: 20, aperturePx: 0, ignored: true,
    keyframes: [{ timeMs: 0, position: { x: 0, y: 0, ignored: 1 }, depthPx: 10, focusDepthPx: -10, aperturePx: 2, ignored: 4 }]
  } });
}, undefined, true);
fixture('camera omitted becomes null', (d, s, b) => {
  b.camera2d = { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 800 };
  d.camera2d = clone(b.camera2d); delete s.camera2d;
}, undefined, true);
fixture('object key order has no effect', (d, s) => {
  d.clips = [Object.fromEntries(Object.entries(clip('a')).reverse()), clip('b', 'u', 1000)]; s.fps = 60;
}, undefined, true);
fixture('server collection omissions default to empty arrays', (d, s) => {
  d.fps = 24;
  for (const key of ['trackFolders', 'markers', 'mediaTracks', 'transcript']) { Reflect.deleteProperty(s, key); }
}, undefined, true);
fixture('null stays distinct from missing scalar', (d, s) => {
  Object.assign(d, { storyboardMaterializations: null });
  s.fps = 60;
}, undefined, true);

// LCG with a fixed seed. Each side starts from the same base and receives
// independent edits, additions, deletions and reorderings.
let seed = 0x5a17cafe;
const random = (max: number): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
};
function mutate(doc: TimelineMergeDoc): void {
  for (let i = 0, count = 1 + random(8); i < count; i++) {
    const fields = ['clips', 'tracks', 'markers', 'trackFolders', 'mediaTracks', 'transcript'] as const;
    const field = fields[random(fields.length)];
    const items = doc[field];
    switch (random(6)) {
      case 0: if (items.length) { items.splice(random(items.length), 1); } break;
      case 1: {
        const index = random(items.length + 1);
        const id = `new${random(5)}`;
        const item = field === 'clips' ? clip(id, random(2) ? 't' : 'u')
          : field === 'tracks' ? track(id, index) : { id, name: `New ${random(100)}` };
        items.splice(index, 0, item);
        break;
      }
      case 2: {
        if (items.length) {
          const index = random(items.length);
          const item = items[index];
          if (typeof item === 'object' && item !== null) {
            items[index] = { ...item, name: `Changed ${random(100)}` };
          }
        }
        break;
      }
      case 3: items.reverse(); break;
      case 4: doc.fps = [24, 30, 60][random(3)]; doc.scriptEnabled = Boolean(random(2)); break;
      case 5: doc.tempo = tempo(60 + random(120)); break;
    }
  }
}
for (let i = 0; i < 300; i++) {
  const ops = [undefined, [], [op('ui_timeline_update_clip', { clip_id: ['a', 'new1'] })],
    [op('ui_timeline_update_track', { trackId: 't' })], [op('ui_timeline_unknown')]][random(5)];
  fixture(`seeded random ${i}`, (d, s) => { mutate(d); mutate(s); }, ops, Boolean(random(2)));
}

describe('native timeline merge matches the web', () => {
  let results: unknown[];
  beforeAll(() => {
    const bin = process.env.NT_MERGE_BINARY;
    if (!bin) { throw new Error('NT_MERGE_BINARY is required'); }
    results = JSON.parse(execFileSync(bin, ['--merge'], {
      input: JSON.stringify(fixtures), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }, maxBuffer: 32 * 1024 * 1024
    }));
    expect(results).toHaveLength(fixtures.length);
  });
  for (const [index, input] of fixtures.entries()) {
    it(input.name, () => {
      const base = timelineMergeDocumentOf(input.base);
      const draft = timelineMergeDocumentOf(input.draft);
      const server = timelineMergeDocumentOfSequence(input.server, base);
      const web = mergeTimelineDocuments(base, draft, server, input.ops, { mergeWithoutOps: input.mergeWithoutOps });
      expect(results[index]).toEqual(JSON.parse(JSON.stringify(web)));
    });
  }
});
