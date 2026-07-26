import { MobileToolRegistry } from '../registry';
import { registerDocumentHandler, resetDocumentHandlers } from '../../agentBridge';
import {
  clipToNode,
  resolveClip,
  timelineDurationMs,
  trackToNode,
  type TimelineAgentHandler,
  type TimelineClipData,
  type TimelineTrackData,
} from '../../timelineTypes';

// Registers the four ui_timeline_* tools as a side effect.
import '../timelineTools';

const SEQ_ID = 'seq-1';

const tracks: TimelineTrackData[] = [
  { id: 't1', name: 'Video 1', type: 'video', index: 0, visible: true, locked: false },
  { id: 't2', name: 'Music', type: 'audio', index: 1, visible: true, locked: false },
];

const clips: TimelineClipData[] = [
  {
    id: 'c1',
    trackId: 't1',
    name: 'Opening shot',
    startMs: 0,
    durationMs: 4000,
    mediaType: 'video',
    sourceType: 'generated',
    status: 'generated',
    locked: false,
    prompt: 'a fox in snow',
    provider: 'fal',
    model: 'flux',
    currentAssetId: 'asset-1',
    versions: [{ id: 'v1' }],
  },
  {
    id: 'c2',
    trackId: 't2',
    name: 'Theme',
    startMs: 1000,
    durationMs: 8000,
    mediaType: 'audio',
    sourceType: 'imported',
    status: 'draft',
    locked: false,
    versions: [],
  },
];

/**
 * A handler built from the same helpers the screen uses, so the tests exercise
 * real target resolution rather than a stub that always succeeds.
 */
function fakeHandler(selectedClipIds: string[]) {
  const trackNameOf = (trackId: string): string | null =>
    tracks.find((track) => track.id === trackId)?.name ?? null;
  const durationMs = timelineDurationMs(clips);
  const handler: TimelineAgentHandler = {
    getSnapshot: () => ({
      sequenceId: SEQ_ID,
      title: 'My Sequence',
      durationMs,
      trackCount: tracks.length,
      clipCount: clips.length,
      playheadMs: 500,
      selectedClipIds,
      tracks: tracks.map((track) =>
        trackToNode(track, clips.filter((clip) => clip.trackId === track.id).length)
      ),
      clips: clips.map((clip) => clipToNode(clip, trackNameOf(clip.trackId))),
      markers: [{ id: 'm1', timeMs: 2000, label: 'Cut' }],
    }),
    getClip: (target) => {
      const clip = resolveClip(clips, target, selectedClipIds);
      return clipToNode(clip, trackNameOf(clip.trackId));
    },
    selectClip: (target) => {
      if (target === null) {
        return null;
      }
      const clip = resolveClip(clips, target, selectedClipIds);
      return clipToNode(clip, trackNameOf(clip.trackId));
    },
    seek: (timeMs) => Math.max(0, Math.min(timeMs, durationMs)),
  };
  return handler;
}

const call = async (
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  (await MobileToolRegistry.call(name, args, `${name}-call`)) as Record<
    string,
    unknown
  >;

describe('timelineTools', () => {
  beforeEach(() => {
    resetDocumentHandlers();
    registerDocumentHandler('timeline', SEQ_ID, 'My Sequence', fakeHandler(['c2']));
  });

  it('registers the read-only timeline tools', () => {
    expect(MobileToolRegistry.names()).toEqual(
      expect.arrayContaining([
        'ui_timeline_get_state',
        'ui_timeline_get_clip',
        'ui_timeline_select_clip',
        'ui_timeline_seek',
      ])
    );
  });

  it('says in every description that the mobile timeline is read-only', () => {
    const timelineTools = MobileToolRegistry.getManifest().filter((entry) =>
      entry.name.startsWith('ui_timeline_')
    );

    expect(timelineTools).toHaveLength(4);
    for (const tool of timelineTools) {
      expect(tool.description).toMatch(/read-only/);
      expect(tool.parameters.required).toContain('timeline_id');
    }
  });

  it('ui_timeline_get_state returns the snapshot', async () => {
    const result = await call('ui_timeline_get_state', { timeline_id: SEQ_ID });

    expect(result).toMatchObject({
      ok: true,
      sequenceId: SEQ_ID,
      title: 'My Sequence',
      durationMs: 9000,
      trackCount: 2,
      clipCount: 2,
      playheadMs: 500,
      selectedClipIds: ['c2'],
    });
  });

  it('ui_timeline_get_clip resolves a clip by id', async () => {
    const result = await call('ui_timeline_get_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
    });

    expect(result.clip).toMatchObject({
      id: 'c1',
      trackName: 'Video 1',
      mediaType: 'video',
      hasAsset: true,
      model: 'flux',
    });
  });

  it('ui_timeline_get_clip resolves a clip by case-insensitive name', async () => {
    const result = await call('ui_timeline_get_clip', {
      timeline_id: SEQ_ID,
      target: 'opening SHOT',
    });

    expect(result.clip).toMatchObject({ id: 'c1' });
  });

  it('ui_timeline_get_clip resolves "selected"', async () => {
    const result = await call('ui_timeline_get_clip', {
      timeline_id: SEQ_ID,
      target: 'selected',
    });

    expect(result.clip).toMatchObject({ id: 'c2', trackName: 'Music' });
  });

  it('ui_timeline_get_clip names the existing clips when the target misses', async () => {
    await expect(
      call('ui_timeline_get_clip', { timeline_id: SEQ_ID, target: 'nope' })
    ).rejects.toThrow(/No clip matches "nope".*c1 \("Opening shot"\)/s);
  });

  it('ui_timeline_select_clip delegates and reports the selection', async () => {
    const selected = await call('ui_timeline_select_clip', {
      timeline_id: SEQ_ID,
      target: 'Theme',
    });

    expect(selected).toMatchObject({ ok: true, selected: { id: 'c2' } });
  });

  it('ui_timeline_select_clip clears the selection when target is omitted', async () => {
    const result = await call('ui_timeline_select_clip', { timeline_id: SEQ_ID });

    expect(result).toEqual({ ok: true, selected: null });
  });

  it('ui_timeline_seek returns the resulting playhead, clamped to the duration', async () => {
    await expect(
      call('ui_timeline_seek', { timeline_id: SEQ_ID, timeMs: 3000 })
    ).resolves.toEqual({ ok: true, playheadMs: 3000 });

    await expect(
      call('ui_timeline_seek', { timeline_id: SEQ_ID, timeMs: 99_000 })
    ).resolves.toEqual({ ok: true, playheadMs: 9000 });
  });

  it('fails with the open ids when the timeline is not open', async () => {
    await expect(
      call('ui_timeline_get_state', { timeline_id: 'not-open' })
    ).rejects.toThrow(
      /No timeline "not-open" is open\. Open timeline ids: seq-1\./
    );
  });

  it('tells the agent to ask the user when no timeline is open at all', async () => {
    resetDocumentHandlers();

    await expect(
      call('ui_timeline_get_state', { timeline_id: SEQ_ID })
    ).rejects.toThrow(/No timeline documents are currently open/);
  });
});
