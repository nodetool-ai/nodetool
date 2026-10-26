import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restFetch } from '../../../../web/src/lib/rest-fetch';
import { makeClip, makeTrack, clipFitsTrack, type DropMode } from '@nodetool-ai/timeline';
import { createTimelineStore } from '../../../../web/src/stores/timeline/TimelineStore';
import { importVideoWithAudio } from '../../../../web/src/hooks/timeline/useVideoAudioImport';
import { assetMediaType } from '../../../../web/src/components/timeline/dnd/assetToClipAdapter';
import { snapAssetDropMs } from '../../../../web/src/components/timeline/Tracks/dropSnap';
import { runAsOneUndoEntry } from '../../../../web/src/stores/timeline/useTimelineHistoryBatch';
import type { Asset } from '../../../../web/src/stores/ApiTypes';
import { checkIds, inputIds, normalize } from '../../scripts/conformance/normalize';

vi.mock('../../../../web/src/lib/rest-fetch', () => ({
  restFetch: vi.fn(() => new Promise<Response>(() => {}))
}));

type Case = {
  name: string;
  media: 'image' | 'audio' | 'video';
  mode: DropMode;
  empty?: boolean;
  audio?: 'free' | 'occupied' | 'absent';
  locked?: boolean;
  incompatible?: boolean;
  startMs?: number;
  overlay?: boolean;
  unknownDuration?: boolean;
};
const modes: DropMode[] = ['overlap', 'overwrite', 'insert'];
const cases: Case[] = modes.flatMap(mode => [
  { name: `image lane ${mode}`, media: 'image', mode },
  { name: `audio lane ${mode}`, media: 'audio', mode },
  ...(['free', 'occupied', 'absent'] as const).map(audio => ({
    name: `video lane ${mode}, audio ${audio}`, media: 'video' as const, mode, audio
  })),
  ...(['image', 'audio', 'video'] as const).map(media => ({
    name: `${media} empty area ${mode}`, media, mode, empty: true
  })),
  { name: `locked video lane ${mode}`, media: 'video', mode, locked: true },
  { name: `image on incompatible audio lane ${mode}`, media: 'image', mode, incompatible: true }
]);
cases.push(
  { name: 'overwrite snaps from second half', media: 'image', mode: 'overwrite', startMs: 7500 },
  { name: 'insert snaps near previous end', media: 'image', mode: 'insert', startMs: 10020 },
  { name: 'video on overlay uses adapter fallback without probing or linking', media: 'video',
    mode: 'overlap', overlay: true, unknownDuration: true }
);

function documentFor(test: Case) {
  const tracks = [
    makeTrack({ id: 'v', name: 'Picture', type: test.overlay ? 'overlay' : 'video', index: 4, locked: test.locked ?? false,
      muted: true, solo: false, heightPx: 96, volumeDb: -3, pan: 0.25 }),
    ...(test.audio === 'absent' ? [] : [
      makeTrack({ id: 'a', name: 'Sound', type: 'audio', index: 8, visible: false, folderId: 'folder' }),
      makeTrack({ id: 'a2', name: 'Sound 2', type: 'audio', index: 9 })
    ])
  ];
  const clips = [
    makeClip({ id: 'picture', trackId: 'v', name: 'Existing picture', mediaType: 'video',
      startMs: 0, durationMs: 10000, currentAssetId: 'existing-picture', inPointMs: 100,
      outPointMs: 10100, opacity: 0.75 }),
    makeClip({ id: 'later', trackId: 'v', name: 'Later picture', mediaType: 'image',
      startMs: 14000, durationMs: 2000 }),
    ...(test.audio === 'absent' ? [] : [
      makeClip({ id: 'sound', trackId: 'a', name: 'Existing sound', mediaType: 'audio',
        startMs: 0, durationMs: 10000, currentAssetId: 'existing-sound' }),
      makeClip({ id: 'sound2', trackId: 'a2', name: 'Other sound', mediaType: 'audio',
        startMs: test.audio === 'occupied' ? 0 : 12000, durationMs: 10000 })
    ])
  ];
  return { fps: 30, width: 640, height: 360, durationMs: 30000,
    tracks, clips, markers: [], mediaTracks: [], trackFolders: [], custom: { preserved: true } };
}

function webDrop(document: ReturnType<typeof documentFor>, test: Case, asset: Asset,
  trackId: string, pointerMs: number, snapMs: number) {
  const store = createTimelineStore();
  store.setState(structuredClone(document));
  const mediaType = assetMediaType(asset.content_type, asset.name);
  if (!mediaType) { throw new Error('Unsupported fixture asset'); }
  const target = store.getState().tracks.find(track => track.id === trackId);
  // These are the guards in TrackLane.handleAssetDrop, before any store call.
  if (!test.empty && (!target || target.locked || !clipFitsTrack(mediaType, target.type))) {
    return document;
  }
  const startMs = test.empty || test.mode === 'overlap' ? pointerMs
    : snapAssetDropMs(store.getState().clips, trackId, pointerMs, snapMs);
  const createTrack = () => {
    store.getState().addTrack(mediaType === 'audio' ? 'audio' : 'video');
    return store.getState().tracks.at(-1)!.id;
  };
  if (mediaType === 'video' && (test.empty || target?.type === 'video')) {
    // Duration is known, so this places both clips synchronously before the
    // mocked, never-settling extract-audio request. No probe runs.
    void importVideoWithAudio(store, asset, test.empty ? createTrack : trackId, startMs, test.mode);
  } else {
    runAsOneUndoEntry(store, () => {
      const id = store.getState().addImportedClip(asset, test.empty ? createTrack() : trackId, startMs);
      store.getState().resolveDrop(new Set([id]), test.mode);
    });
  }
  const state = store.getState();
  return Object.fromEntries(Object.keys(document).map(key => [key, Reflect.get(state, key)]));
}

// The shared helper handles clip/link ids. Present track references as id
// fields too, so fresh tracks and the clips referring to them share a name.
function normalizeDocument(document: unknown, known: Set<string>): unknown {
  const refs: unknown = JSON.parse(JSON.stringify(document, (key: string, value: unknown) =>
    key === 'trackId' && typeof value === 'string' ? { id: value } : value));
  return normalize(refs, known);
}

describe('assets.dropAsset whole documents against web drop handlers', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  for (const test of cases) {
    it(test.name, () => {
      vi.useFakeTimers();
      const document = documentFor(test);
      // The drop code reads only these asset fields, not persistence metadata.
      const asset = { id: '0123456789abcdef0123456789abcdef', name: `Dropped.${test.media}`,
        content_type: `${test.media}/${test.media === 'image' ? 'png' : test.media === 'video' ? 'mp4' : 'wav'}`,
        duration: test.unknownDuration ? undefined : 2, metadata: { thumbnails: ['thumbnail-asset'] } } as unknown as Asset;
      const trackId = test.empty ? '' : test.media === 'audio' || test.incompatible ? 'a' : 'v';
      const pointerMs = Math.max(0, Math.round(test.startMs ?? 2500));
      const snapMs = 24;
      const expected = webDrop(document, test, asset, trackId, pointerMs, snapMs);
      const binary = process.env.NT_ASSETS_ORACLE;
      if (!binary) { throw new Error('NT_ASSETS_ORACLE is required'); }
      const [actual] = JSON.parse(execFileSync(binary, [JSON.stringify([{ op: 'drop', document,
        payload: { asset, trackId, startMs: pointerMs, mode: test.mode, snapMs } }])], {
        encoding: 'utf8', timeout: 10000, env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }
      }));
      const known = inputIds({ document, asset });
      expect(checkIds(actual.clips, document.clips)).toEqual([]);
      expect(normalizeDocument(actual, known)).toEqual(normalizeDocument(expected, known));
    });
  }
});


describe('B conformance ownership', () => {
  it('keeps comparison tests under src/assets', () => {
    const binary = process.env.NT_ASSETS_ORACLE;
    if (!binary) { throw new Error('NT_ASSETS_ORACLE is required'); }
    const suiteUrl = pathToFileURL(resolve(dirname(binary), '../scripts/conformance/suites/assets.mjs')).href;
    const tests: string[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
      `import suite from ${JSON.stringify(suiteUrl)}; console.log(JSON.stringify(suite.tests))`], { encoding: 'utf8' }));
    expect(tests.every(file => file.includes('/src/assets/'))).toBe(true);
  });
});

describe('linked audio settlement against importVideoWithAudio', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });
  for (const audio of ['free', 'absent'] as const) {
    for (const outcome of ['audio', 'silent', 'failed', 'exception'] as const) {
      for (const duration of outcome === 'audio' ? [1.2345, null] : [null]) {
        it(`${outcome}, ${audio} audio track, duration ${duration}`, async () => {
          vi.useFakeTimers();
          vi.mocked(restFetch).mockImplementationOnce(async () => {
            if (outcome === 'exception') { throw new Error('download timed out'); }
            return new Response(JSON.stringify({ has_audio: outcome === 'audio',
              asset: outcome === 'audio' ? { id: 'extracted-audio', duration } : undefined }),
            { status: outcome === 'failed' ? 503 : 200 });
          });
          const document = documentFor({ name: '', media: 'video', mode: 'overlap', audio });
          const asset = { id: 'video-asset', name: 'take.mp4', content_type: 'video/mp4', duration: 2 } as unknown as Asset;
          const store = createTimelineStore();
          store.setState(structuredClone(document));
          await importVideoWithAudio(store, asset, 'v', 2500, 'overlap');
          const state = store.getState();
          const expected = { ...document, clips: state.clips, tracks: state.tracks };
          const binary = process.env.NT_ASSETS_ORACLE;
          if (!binary) { throw new Error('NT_ASSETS_ORACLE is required'); }
          const run = (requests: unknown[]) => JSON.parse(execFileSync(binary, [JSON.stringify(requests)], {
            encoding: 'utf8', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }
          }));
          const [dropped] = run([{ op: 'drop', document,
            payload: { asset, trackId: 'v', startMs: 2500, mode: 'overlap' } }]);
          const placeholder = dropped.clips.find((clip: { status: string }) => clip.status === 'generating');
          const [actual] = run([{ op: 'settle', document: dropped, payload: {
            audioClipId: placeholder.id, outcome: outcome === 'exception' ? 'failed' : outcome,
            ...(outcome === 'audio' ? { asset: { id: 'extracted-audio', duration } } : {})
          } }]);
          const known = inputIds({ document, asset });
          known.add('extracted-audio');
          if (outcome === 'silent' && audio === 'absent') {
            // replaceClips cannot remove tracks without an undo command. Native
            // deliberately retains this import's empty audio track.
            expect(actual.tracks).toEqual(dropped.tracks);
            expect(actual.tracks.length).toBe(expected.tracks.length + 1);
            expect(normalizeDocument(actual.clips, known)).toEqual(normalizeDocument(expected.clips, known));
          } else {
            expect(normalizeDocument(actual, known)).toEqual(normalizeDocument(expected, known));
          }
        });
      }
    }
  }
});
