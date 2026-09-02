/**
 * Tests for the `ui_timeline_*` tool layer.
 *
 * The tools are thin: they validate nothing themselves, they delegate through
 * the agent bridge. So these check the contract — every tool requires
 * `timeline_id`, arguments arrive at the handler in the shape it expects, and
 * results come back under `ok: true` — plus the two things the descriptions must
 * say: that editing is available here, and that generation and rendering are not.
 */

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

// Registers the ui_timeline_* tools as a side effect.
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
    versions: [],
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

const trackNameOf = (trackId: string): string | null =>
  tracks.find((track) => track.id === trackId)?.name ?? null;

const node = (clip: TimelineClipData) => clipToNode(clip, trackNameOf(clip.trackId));

/** Every write call, in order, so the tests can assert what reached the handler. */
let calls: { name: string; args: unknown[] }[] = [];

const record = <T>(name: string, args: unknown[], value: T): T => {
  calls.push({ name, args });
  return value;
};

/**
 * A handler built from the same helpers the screen uses, so target resolution is
 * really exercised rather than stubbed into always succeeding.
 */
function fakeHandler(selectedClipIds: string[]): TimelineAgentHandler {
  const durationMs = timelineDurationMs(clips);
  const resolve = (target: string) => resolveClip(clips, target, selectedClipIds);
  return {
    getSnapshot: () => ({
      sequenceId: SEQ_ID,
      title: 'My Sequence',
      durationMs,
      trackCount: tracks.length,
      clipCount: clips.length,
      playheadMs: 500,
      selectedClipIds,
      dirty: false,
      tracks: tracks.map((track) =>
        trackToNode(track, clips.filter((clip) => clip.trackId === track.id).length)
      ),
      clips: clips.map(node),
      markers: [{ id: 'm1', timeMs: 2000, label: 'Cut' }],
      transcript: [{ id: 'line-1', text: 'Spoken line.', clipIds: ['c2'] }],
    }),
    getClip: (target) => node(resolve(target)),
    selectClip: (target) => (target === null ? null : node(resolve(target))),
    seek: (timeMs) => Math.max(0, Math.min(timeMs, durationMs)),

    addTrack: (type, name) =>
      record('addTrack', [type, name], {
        id: 't3',
        name: name ?? 'overlay 3',
        type,
        index: 2,
        visible: true,
        locked: false,
        clipCount: 0,
      }),
    addTextClip: (input) => record('addTextClip', [input], node(clips[0])),
    addShapeClip: (input) => record('addShapeClip', [input], node(clips[0])),
    moveClip: (target, patch) =>
      record('moveClip', [target, patch], [node(resolve(target))]),
    trimClip: (target, patch) =>
      record('trimClip', [target, patch], [node(resolve(target))]),
    splitClip: (target, atMs) =>
      record('splitClip', [target, atMs], [node(clips[0]), node(clips[1])]),
    deleteClip: (target) => record('deleteClip', [target], node(resolve(target))),
    duplicateClip: (target, gapMs) =>
      record('duplicateClip', [target, gapMs], [node(resolve(target))]),
    setClipParams: (target, patch) =>
      record('setClipParams', [target, patch], node(resolve(target))),
    addMediaClip: async (input) =>
      record('addMediaClip', [input], node(clips[0])),
    setClipBinding: (target, patch) =>
      record('setClipBinding', [target, patch], node(resolve(target))),
    animateClip: (target, animations, mode) =>
      record('animateClip', [target, animations, mode], node(resolve(target))),
    clearAnimations: (target, role) =>
      record('clearAnimations', [target, role], node(resolve(target))),
    addGroup: (input) =>
      record('addGroup', [input], {
        clip: node(clips[0]),
        children: input.children ?? [],
      }),
    setParent: (target, parentId) =>
      record('setParent', [target, parentId], node(resolve(target))),
    setTransition: (target, transition) =>
      record('setTransition', [target, transition], node(resolve(target))),
    setMask: (target, mask) =>
      record('setMask', [target, mask], node(resolve(target))),
    setMatte: (target, matte) =>
      record('setMatte', [target, matte], node(resolve(target))),
    setEffects: (target, effects) =>
      record('setEffects', [target, effects], node(resolve(target))),
    setTimeRemap: (target, timeRemap) =>
      record('setTimeRemap', [target, timeRemap], node(resolve(target))),
    setMarkersFromBeats: (input) =>
      record('setMarkersFromBeats', [input], {
        grid: { count: 2, firstMs: 0, lastMs: 500 },
        added: [],
        skippedTimesMs: [],
        markers: 1,
      }),
    snapToBeats: (input) =>
      record('snapToBeats', [input], {
        grid: { count: 2, firstMs: 0, lastMs: 500 },
        toleranceMs: 60,
        mode: 'start' as const,
        action: 'move' as const,
        snapped: 1,
        skipped: 0,
        clips: [],
      }),
    addMarker: (input) =>
      record('addMarker', [input], {
        id: 'm2',
        timeMs: input.timeMs,
        label: input.label ?? '',
      }),
    deleteMarker: (target) =>
      record('deleteMarker', [target], { id: 'm1', timeMs: 2000, label: 'Cut' }),
    rename: (name) => record('rename', [name], { title: name }),
    save: async () => record('save', [], { ok: true as const, updatedAt: 'now' }),
  };
}

const call = async (
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  (await MobileToolRegistry.call(name, args, `${name}-call`)) as Record<
    string,
    unknown
  >;

const WRITE_TOOLS = [
  'ui_timeline_add_track',
  'ui_timeline_add_text_clip',
  'ui_timeline_add_shape_clip',
  'ui_timeline_move_clip',
  'ui_timeline_trim_clip',
  'ui_timeline_split_clip',
  'ui_timeline_delete_clip',
  'ui_timeline_duplicate_clip',
  'ui_timeline_set_clip_params',
  'ui_timeline_add_marker',
  'ui_timeline_delete_marker',
  'ui_timeline_rename',
  'ui_timeline_save',
  'ui_timeline_add_media_clip',
  'ui_timeline_set_clip_binding',
  'ui_timeline_animate_clip',
  'ui_timeline_clear_animations',
  'ui_timeline_add_group',
  'ui_timeline_set_parent',
  'ui_timeline_set_transition',
  'ui_timeline_set_mask',
  'ui_timeline_set_matte',
  'ui_timeline_set_effects',
  'ui_timeline_set_time_remap',
  'ui_timeline_set_markers_from_beats',
  'ui_timeline_snap_to_beats',
  'ui_timeline_edit',
];

/** Arguments that satisfy every write tool's required fields at once. */
const EVERY_REQUIRED_ARG = {
  target: 'c1',
  type: 'video',
  text: 'x',
  name: 'x',
  timeMs: 0,
  startMs: 0,
  durationMs: 1000,
  shape: { kind: 'rect' },
  asset: 'asset-1',
  animations: [{ role: 'in', preset: 'fade' }],
  parentId: null,
  transition: null,
  mask: null,
  matte: null,
  effects: [],
  timeRemap: null,
  ops: [{ tool: 'ui_timeline_get_state' }],
};

/**
 * The one tool that reads the preset catalog rather than a sequence, so it is
 * the one tool with no `timeline_id`.
 */
const CATALOG_TOOL = 'ui_timeline_list_animation_presets';

describe('timelineTools', () => {
  beforeEach(() => {
    calls = [];
    resetDocumentHandlers();
    registerDocumentHandler('timeline', SEQ_ID, 'My Sequence', fakeHandler(['c2']));
  });

  it('registers the read and the write tools', () => {
    expect(MobileToolRegistry.names()).toEqual(
      expect.arrayContaining([
        'ui_timeline_get_state',
        'ui_timeline_get_clip',
        'ui_timeline_select_clip',
        'ui_timeline_seek',
        ...WRITE_TOOLS,
      ])
    );
  });

  it('does not offer generation or frame inspection, which are desktop-only', () => {
    expect(MobileToolRegistry.has('ui_timeline_generate_clip')).toBe(false);
    expect(MobileToolRegistry.has('ui_timeline_get_clip_frames')).toBe(false);
  });

  it('never claims the timeline is read-only, and always requires timeline_id', () => {
    const timelineTools = MobileToolRegistry.getManifest().filter((entry) =>
      entry.name.startsWith('ui_timeline_')
    );

    expect(timelineTools).toHaveLength(5 + WRITE_TOOLS.length);
    for (const tool of timelineTools) {
      expect(tool.description).not.toMatch(/read-only/);
      if (tool.name !== CATALOG_TOOL) {
        expect(tool.parameters.required).toContain('timeline_id');
      }
    }
  });

  it('tells the agent that generation and rendering are desktop-only', () => {
    const state = MobileToolRegistry.getManifest().find(
      (entry) => entry.name === 'ui_timeline_get_state'
    );

    expect(state?.description).toMatch(/desktop-only/);
  });

  it('tells the agent an edit still has to be saved', () => {
    const move = MobileToolRegistry.getManifest().find(
      (entry) => entry.name === 'ui_timeline_move_clip'
    );

    expect(move?.description).toMatch(/ui_timeline_save/);
  });

  // ── Reads ────────────────────────────────────────────────────────────────

  it('ui_timeline_get_state returns the snapshot, including the transcript', async () => {
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
      dirty: false,
      transcript: [{ id: 'line-1', clipIds: ['c2'] }],
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

  // ── Writes ───────────────────────────────────────────────────────────────

  it('ui_timeline_add_track forwards the type and name', async () => {
    const result = await call('ui_timeline_add_track', {
      timeline_id: SEQ_ID,
      type: 'overlay',
      name: 'Titles',
    });

    expect(calls).toEqual([{ name: 'addTrack', args: ['overlay', 'Titles'] }]);
    expect(result).toMatchObject({ ok: true, track: { name: 'Titles' } });
  });

  it('ui_timeline_add_text_clip forwards the text, placement, and style', async () => {
    await call('ui_timeline_add_text_clip', {
      timeline_id: SEQ_ID,
      text: 'Chapter One',
      trackId: 'Titles',
      startMs: 1200,
      durationMs: 2500,
      style: { fontSizePx: 64, color: '#ff0000' },
    });

    expect(calls[0]).toEqual({
      name: 'addTextClip',
      args: [
        {
          text: 'Chapter One',
          trackId: 'Titles',
          startMs: 1200,
          durationMs: 2500,
          style: { fontSizePx: 64, color: '#ff0000' },
        },
      ],
    });
  });

  it('ui_timeline_add_shape_clip forwards the shape', async () => {
    await call('ui_timeline_add_shape_clip', {
      timeline_id: SEQ_ID,
      shape: { kind: 'rect', x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
    });

    expect(calls[0].args[0]).toMatchObject({
      shape: { kind: 'rect', width: 0.3 },
    });
  });

  it('ui_timeline_move_clip forwards the patch and returns every clip that moved', async () => {
    const result = await call('ui_timeline_move_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
      startMs: 2000,
      trackId: 't2',
    });

    expect(calls).toEqual([
      { name: 'moveClip', args: ['c1', { startMs: 2000, trackId: 't2' }] },
    ]);
    expect(result).toMatchObject({ ok: true, clips: [{ id: 'c1' }] });
  });

  it('ui_timeline_trim_clip forwards all three fields', async () => {
    await call('ui_timeline_trim_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
      durationMs: 3000,
    });

    expect(calls[0]).toEqual({
      name: 'trimClip',
      args: [
        'c1',
        { durationMs: 3000, inPointMs: undefined, outPointMs: undefined },
      ],
    });
  });

  it('ui_timeline_split_clip passes atMs through, and undefined when omitted', async () => {
    await call('ui_timeline_split_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
      atMs: 1500,
    });
    await call('ui_timeline_split_clip', { timeline_id: SEQ_ID, target: 'c1' });

    expect(calls.map((entry) => entry.args)).toEqual([
      ['c1', 1500],
      ['c1', undefined],
    ]);
  });

  it('ui_timeline_delete_clip reports what it removed', async () => {
    const result = await call('ui_timeline_delete_clip', {
      timeline_id: SEQ_ID,
      target: 'Theme',
    });

    expect(result).toMatchObject({ ok: true, deleted: { id: 'c2' } });
  });

  it('ui_timeline_duplicate_clip forwards the gap', async () => {
    await call('ui_timeline_duplicate_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
      gapMs: 500,
    });

    expect(calls[0].args).toEqual(['c1', 500]);
  });

  it('ui_timeline_set_clip_params forwards params and binding fields together', async () => {
    await call('ui_timeline_set_clip_params', {
      timeline_id: SEQ_ID,
      target: 'c1',
      opacity: 0.5,
      prompt: 'a fox at dusk',
    });

    expect(calls[0]).toEqual({
      name: 'setClipParams',
      args: ['c1', { opacity: 0.5, prompt: 'a fox at dusk' }],
    });
  });

  it('ui_timeline_set_clip_params documents the staleness rule', () => {
    const tool = MobileToolRegistry.getManifest().find(
      (entry) => entry.name === 'ui_timeline_set_clip_params'
    );

    expect(tool?.description).toMatch(/marks an already-generated clip `stale`/);
  });

  it('ui_timeline_add_marker and delete_marker round-trip', async () => {
    const added = await call('ui_timeline_add_marker', {
      timeline_id: SEQ_ID,
      timeMs: 4500,
      label: 'Beat',
    });
    expect(added).toMatchObject({
      ok: true,
      marker: { timeMs: 4500, label: 'Beat' },
    });

    const deleted = await call('ui_timeline_delete_marker', {
      timeline_id: SEQ_ID,
      target: 'Cut',
    });
    expect(deleted).toMatchObject({ ok: true, deleted: { id: 'm1' } });
  });

  it('ui_timeline_rename returns the new title', async () => {
    const result = await call('ui_timeline_rename', {
      timeline_id: SEQ_ID,
      name: 'Trailer v2',
    });

    expect(result).toEqual({ ok: true, title: 'Trailer v2' });
  });

  it('ui_timeline_save reports the persisted timestamp', async () => {
    const result = await call('ui_timeline_save', { timeline_id: SEQ_ID });

    expect(result).toEqual({ ok: true, updatedAt: 'now' });
  });

  // ── Bridge failures ──────────────────────────────────────────────────────

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

  it('every write tool fails through the bridge when nothing is open', async () => {
    resetDocumentHandlers();

    for (const toolName of WRITE_TOOLS) {
      if (toolName === 'ui_timeline_edit') {
        // The batch reports its ops' failures rather than throwing.
        const result = await call(toolName, {
          timeline_id: SEQ_ID,
          ops: [{ tool: 'add_track', input: { type: 'video' } }],
        });
        expect(result).toMatchObject({ applied: 0, failed: 1 });
        continue;
      }
      await expect(
        call(toolName, { timeline_id: SEQ_ID, ...EVERY_REQUIRED_ARG })
      ).rejects.toThrow(/No timeline documents are currently open/);
    }
  });

  // ── Media, binding, motion ───────────────────────────────────────────────

  it('ui_timeline_add_media_clip forwards the asset reference and placement', async () => {
    const result = await call('ui_timeline_add_media_clip', {
      timeline_id: SEQ_ID,
      asset: 'asset://abc.mp4',
      trackId: 'Video 1',
      startMs: 2000,
    });

    expect(calls[0]).toEqual({
      name: 'addMediaClip',
      args: [
        {
          asset: 'asset://abc.mp4',
          trackId: 'Video 1',
          startMs: 2000,
          durationMs: undefined,
          name: undefined,
        },
      ],
    });
    expect(result).toMatchObject({ ok: true, clip: { id: 'c1' } });
  });

  it('ui_timeline_set_clip_binding forwards only binding fields', async () => {
    await call('ui_timeline_set_clip_binding', {
      timeline_id: SEQ_ID,
      target: 'c1',
      prompt: 'a fox at dawn',
      seed: 7,
    });

    expect(calls[0]).toEqual({
      name: 'setClipBinding',
      args: ['c1', { prompt: 'a fox at dawn', seed: 7 }],
    });
  });

  it('ui_timeline_set_clip_binding says aspectRatio and resolution are not taken', () => {
    const tool = MobileToolRegistry.getManifest().find(
      (entry) => entry.name === 'ui_timeline_set_clip_binding'
    );

    expect(Object.keys(tool?.parameters.properties ?? {})).not.toContain(
      'aspectRatio'
    );
    expect(tool?.description).toMatch(/aspectRatio` and `resolution` are not/);
  });

  it('ui_timeline_animate_clip forwards the animation list and the mode', async () => {
    const result = await call('ui_timeline_animate_clip', {
      timeline_id: SEQ_ID,
      target: 'c1',
      mode: 'add',
      animations: [{ role: 'in', preset: 'fade', durationMs: 400 }],
    });

    expect(calls[0]).toEqual({
      name: 'animateClip',
      args: ['c1', [{ role: 'in', preset: 'fade', durationMs: 400 }], 'add'],
    });
    expect(result).toMatchObject({ ok: true, clip: { id: 'c1' } });
  });

  it('ui_timeline_animate_clip points a `code` body at the headless tool', () => {
    const tool = MobileToolRegistry.getManifest().find(
      (entry) => entry.name === 'ui_timeline_animate_clip'
    );

    expect(tool?.description).toMatch(/`code` body into curves is not available/);
    expect(tool?.description).toMatch(/edit_timeline/);
  });

  it('ui_timeline_clear_animations forwards the role, or undefined for all', async () => {
    await call('ui_timeline_clear_animations', {
      timeline_id: SEQ_ID,
      target: 'c1',
      role: 'out',
    });
    await call('ui_timeline_clear_animations', {
      timeline_id: SEQ_ID,
      target: 'c1',
    });

    expect(calls.map((entry) => entry.args)).toEqual([
      ['c1', 'out'],
      ['c1', undefined],
    ]);
  });

  it('ui_timeline_list_animation_presets reads the catalog with no timeline', async () => {
    const result = (await call(CATALOG_TOOL, {})) as {
      ok: boolean;
      presets: { id: string; roles: string[] }[];
      custom: unknown;
    };

    expect(result.ok).toBe(true);
    expect(result.presets.length).toBeGreaterThan(0);
    expect(result.presets.map((preset) => preset.id)).toContain('fade');
    expect(result.custom).toBeDefined();
    // It touched no handler, so it works with nothing open.
    expect(calls).toEqual([]);
  });

  // ── Groups and compositing ───────────────────────────────────────────────

  it('ui_timeline_add_group forwards the window and the children', async () => {
    const result = await call('ui_timeline_add_group', {
      timeline_id: SEQ_ID,
      name: 'Title block',
      startMs: 0,
      durationMs: 3000,
      children: ['c1'],
    });

    expect(calls[0]).toEqual({
      name: 'addGroup',
      args: [
        {
          name: 'Title block',
          startMs: 0,
          durationMs: 3000,
          trackId: undefined,
          children: ['c1'],
        },
      ],
    });
    expect(result).toMatchObject({ ok: true, children: ['c1'] });
  });

  it('ui_timeline_set_parent forwards null as a release', async () => {
    await call('ui_timeline_set_parent', {
      timeline_id: SEQ_ID,
      target: 'c1',
      parentId: null,
    });
    await call('ui_timeline_set_parent', {
      timeline_id: SEQ_ID,
      target: 'c1',
      parentId: 'c2',
    });

    expect(calls.map((entry) => entry.args)).toEqual([
      ['c1', null],
      ['c1', 'c2'],
    ]);
  });

  it('ui_timeline_set_transition forwards the transition, and null to clear', async () => {
    await call('ui_timeline_set_transition', {
      timeline_id: SEQ_ID,
      target: 'c1',
      transition: { type: 'wipe', durationMs: 500, direction: 'left' },
    });
    await call('ui_timeline_set_transition', {
      timeline_id: SEQ_ID,
      target: 'c1',
      transition: null,
    });

    expect(calls.map((entry) => entry.args[1])).toEqual([
      { type: 'wipe', durationMs: 500, direction: 'left' },
      null,
    ]);
  });

  it('ui_timeline_set_mask and set_matte forward their payloads', async () => {
    await call('ui_timeline_set_mask', {
      timeline_id: SEQ_ID,
      target: 'c1',
      mask: { kind: 'ellipse', x: 0.2, featherPx: 4 },
    });
    await call('ui_timeline_set_matte', {
      timeline_id: SEQ_ID,
      target: 'c1',
      matte: { source: 'c2', mode: 'luma' },
    });

    expect(calls).toEqual([
      { name: 'setMask', args: ['c1', { kind: 'ellipse', x: 0.2, featherPx: 4 }] },
      { name: 'setMatte', args: ['c1', { source: 'c2', mode: 'luma' }] },
    ]);
  });

  it('ui_timeline_set_effects forwards the whole chain, empty to clear', async () => {
    await call('ui_timeline_set_effects', {
      timeline_id: SEQ_ID,
      target: 'c1',
      effects: [{ type: 'blur', radius: 6 }],
    });
    await call('ui_timeline_set_effects', {
      timeline_id: SEQ_ID,
      target: 'c1',
      effects: [],
    });

    expect(calls.map((entry) => entry.args[1])).toEqual([
      [{ type: 'blur', radius: 6 }],
      [],
    ]);
  });

  it('ui_timeline_set_time_remap forwards the curve, and null to clear', async () => {
    const timeRemap = {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: 4000 },
      ],
    };
    await call('ui_timeline_set_time_remap', {
      timeline_id: SEQ_ID,
      target: 'c1',
      timeRemap,
    });
    await call('ui_timeline_set_time_remap', {
      timeline_id: SEQ_ID,
      target: 'c1',
      timeRemap: null,
    });

    expect(calls.map((entry) => entry.args[1])).toEqual([timeRemap, null]);
  });

  // ── Beats ────────────────────────────────────────────────────────────────

  it('ui_timeline_set_markers_from_beats renames the snake_case grid fields', async () => {
    const result = await call('ui_timeline_set_markers_from_beats', {
      timeline_id: SEQ_ID,
      bpm: 120,
      offset_ms: 250,
      count: 8,
      label: 'Hit',
    });

    expect(calls[0]).toEqual({
      name: 'setMarkersFromBeats',
      args: [
        {
          onsetsMs: undefined,
          bpm: 120,
          offsetMs: 250,
          count: 8,
          label: 'Hit',
        },
      ],
    });
    expect(result).toMatchObject({ ok: true, markers: 1 });
  });

  it('ui_timeline_snap_to_beats renames the snake_case fields and passes targets', async () => {
    const result = await call('ui_timeline_snap_to_beats', {
      timeline_id: SEQ_ID,
      targets: ['c1'],
      onsets_ms: [0, 500],
      tolerance_ms: 80,
      mode: 'both',
      action: 'trim',
    });

    expect(calls[0]).toEqual({
      name: 'snapToBeats',
      args: [
        {
          targets: ['c1'],
          onsetsMs: [0, 500],
          bpm: undefined,
          offsetMs: undefined,
          toleranceMs: 80,
          mode: 'both',
          action: 'trim',
        },
      ],
    });
    expect(result).toMatchObject({ ok: true, snapped: 1, skipped: 0 });
  });

  // ── Batch ────────────────────────────────────────────────────────────────

  it('ui_timeline_edit applies each op in order, filling in timeline_id', async () => {
    const result = await call('ui_timeline_edit', {
      timeline_id: SEQ_ID,
      ops: [
        { tool: 'ui_timeline_add_track', input: { type: 'overlay', name: 'Titles' } },
        { tool: 'set_clip_params', input: { target: 'c1', opacity: 0.4 } },
      ],
    });

    expect(calls).toEqual([
      { name: 'addTrack', args: ['overlay', 'Titles'] },
      { name: 'setClipParams', args: ['c1', { opacity: 0.4 }] },
    ]);
    expect(result).toMatchObject({ ok: true, applied: 2, failed: 0 });
    expect(
      (result.results as { index: number; tool: string; ok: boolean }[]).map(
        (entry) => [entry.index, entry.tool, entry.ok]
      )
    ).toEqual([
      [0, 'ui_timeline_add_track', true],
      [1, 'ui_timeline_set_clip_params', true],
    ]);
  });

  it('ui_timeline_edit continues past a failing op and reports its error', async () => {
    const result = await call('ui_timeline_edit', {
      timeline_id: SEQ_ID,
      ops: [
        { tool: 'delete_clip', input: { target: 'nope' } },
        { tool: 'delete_clip', input: { target: 'c1' } },
      ],
    });

    expect(result).toMatchObject({ ok: true, applied: 1, failed: 1 });
    const results = result.results as {
      ok: boolean;
      error?: string;
      result?: unknown;
    }[];
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/No clip matches "nope"/);
    expect(results[1]).toMatchObject({ ok: true });
    // The second op still reached the handler.
    expect(calls).toEqual([{ name: 'deleteClip', args: ['c1'] }]);
  });

  it('ui_timeline_edit refuses an unknown tool and refuses to nest', async () => {
    const result = await call('ui_timeline_edit', {
      timeline_id: SEQ_ID,
      ops: [{ tool: 'burn_it_down' }, { tool: 'ui_timeline_edit', input: { ops: [] } }],
    });

    expect(result).toMatchObject({ applied: 0, failed: 2 });
    const results = result.results as { error?: string }[];
    expect(results[0].error).toMatch(/Unknown tool "burn_it_down"/);
    expect(results[1].error).toMatch(/cannot nest/);
  });

  it('ui_timeline_edit rejects an empty op list', async () => {
    await expect(
      call('ui_timeline_edit', { timeline_id: SEQ_ID, ops: [] })
    ).rejects.toThrow(/at least one op/);
  });
});
