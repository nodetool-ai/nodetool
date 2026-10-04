import React from 'react';
import { StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import TimelineViewerScreen from '../TimelineViewerScreen';
import type { RootStackParamList } from '../../navigation/types';
import * as TimelineDefaults from '../../../../packages/timeline/src/defaults';
import { applyTimelineOp } from '@nodetool-ai/timeline/ops';
import {
  FIXTURES,
  directState,
  directContext,
} from '../../../../packages/timeline/tests/fixtures/ops';
import { resolveShapeArg } from '@nodetool-ai/protocol/api-schemas/timeline-tool-params';
import { MobileToolRegistry } from '../../documents/tools/registry';
import '../../documents/tools/timelineTools';
import {
  documentStore,
  resetDocumentStores,
} from '../../documents/documentStore';
import {
  getDocumentHandler,
  resetDocumentHandlers,
} from '../../documents/agentBridge';

const isNumber = (value: unknown): value is number => typeof value === 'number';
import type {
  TimelineAgentHandler,
  TimelineClipNode,
  TimelineDocument,
} from '../../documents/timelineTypes';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The stack's focus effect reduces to a plain effect in tests.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const react = require('react');
    react.useEffect(effect, [effect]);
  },
}));

const mockRead = jest.fn();
const mockUpdate = jest.fn();
const mockAssetGet = jest.fn();

// `useUtils()` returns one stable object per app in tRPC; the screen keeps it in
// a callback dependency list, so a fresh object per render would re-register the
// agent handler on every render.
const mockTrpcUtils = {
  assets: { get: { fetch: (input: unknown) => mockAssetGet(input) } },
};

jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: {
      read: { query: (input: unknown) => mockRead(input) },
      update: { mutate: (input: unknown) => mockUpdate(input) },
    },
  }),
  trpc: { useUtils: () => mockTrpcUtils },
}));

const SEQ_ID = 'seq-1';

const sequence: TimelineDocument = {
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
  ],
  clips: [
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
      versions: [
        {
          id: 'v1',
          createdAt: '2026-07-01T00:00:00Z',
          jobId: 'job-v1',
          assetId: 'asset-1',
          workflowUpdatedAt: '2026-07-01T00:00:00Z',
          dependencyHash: 'hash-v1',
          paramOverridesSnapshot: {},
          status: 'success',
        },
        {
          id: 'v2',
          createdAt: '2026-07-01T00:00:00Z',
          jobId: 'job-v2',
          assetId: 'asset-2',
          workflowUpdatedAt: '2026-07-01T00:00:00Z',
          dependencyHash: 'hash-v2',
          paramOverridesSnapshot: {},
          status: 'success',
        },
      ],
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
  ],
  markers: [{ id: 'm1', timeMs: 2000, label: 'Cut' }],
};

const detail = (doc: TimelineDocument) => ({
  ref: { kind: 'timeline', id: SEQ_ID, revision: 3 },
  name: 'My Sequence',
  document: doc,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

type Props = NativeStackScreenProps<RootStackParamList, 'TimelineViewer'>;

/** The screen calls only these three; the navigator prop is far wider. */
const partialNavigation: Pick<
  Props['navigation'],
  'setOptions' | 'navigate' | 'goBack'
> = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
};
// SAFETY: nothing under test reaches for another navigator method.
const navigation = partialNavigation as Props['navigation'];

const route = {
  key: 'TimelineViewer-1',
  name: 'TimelineViewer',
  params: { id: SEQ_ID, name: 'Seed name' },
} as Props['route'];

const renderScreen = () =>
  render(<TimelineViewerScreen navigation={navigation} route={route} />);

const widthOf = (label: string): number | undefined => {
  const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
  return isNumber(style.width) ? style.width : undefined;
};

/**
 * The header lives in navigation options, not in the screen's tree, so it is
 * rendered off the last `setOptions` call. That render repoints the global
 * `screen`, so a test asserting on both reads the screen through the result
 * `renderScreen()` returns.
 */
const renderHeaderRight = () => {
  const calls = jest.mocked(navigation.setOptions).mock.calls as [
    { headerRight?: () => React.ReactElement },
  ][];
  const HeaderRight = calls[calls.length - 1][0].headerRight;
  if (HeaderRight === undefined) {
    throw new Error('the screen set no headerRight');
  }
  return render(<HeaderRight />);
};

const saveButton = () =>
  renderHeaderRight().getByLabelText('Save timeline').props;

describe('TimelineViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentStores();
    resetDocumentHandlers();
    mockRead.mockResolvedValue(detail(sequence));
  });

  it('loads the document and renders a lane per track with its clips', async () => {
    renderScreen();

    await waitFor(() =>
      expect(mockRead).toHaveBeenCalledWith({
        ref: { kind: 'timeline', id: SEQ_ID },
      }),
    );

    expect(await screen.findByText('Video 1')).toBeTruthy();
    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByLabelText('Seek on track Video 1')).toBeTruthy();
    expect(screen.getByLabelText(/^Clip Opening shot, video/)).toBeTruthy();
    expect(screen.getByLabelText(/^Clip Theme, audio/)).toBeTruthy();
    expect(screen.getByLabelText('Marker Cut at 0:02')).toBeTruthy();
    // Duration comes from the clips: 1000 + 8000.
    expect(screen.getByText('0:09 · 2 tracks · 2 clips')).toBeTruthy();
  });

  it('shows the clip detail panel when a clip is tapped', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText(/^Clip Opening shot/));

    expect(screen.getByLabelText('Close clip details')).toBeTruthy();
    expect(screen.getByText('a fox in snow')).toBeTruthy();
    expect(screen.getByText('fal / flux')).toBeTruthy();
    expect(screen.getByText('0:00 – 0:04 (0:04)')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Close clip details'));

    expect(screen.queryByLabelText('Close clip details')).toBeNull();
  });

  it('zooming changes the pixel width of a clip', async () => {
    renderScreen();

    await screen.findByLabelText(/^Clip Opening shot/);
    const initial = widthOf('Clip Opening shot, video, 0:00 to 0:04');
    expect(initial).toBe(80);

    fireEvent.press(screen.getByLabelText('Zoom in'));
    expect(widthOf('Clip Opening shot, video, 0:00 to 0:04')).toBe(160);

    fireEvent.press(screen.getByLabelText('Zoom out'));
    fireEvent.press(screen.getByLabelText('Zoom out'));
    expect(widthOf('Clip Opening shot, video, 0:00 to 0:04')).toBe(40);
  });

  it('tapping a lane moves the playhead', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Seek on track Video 1'), {
      nativeEvent: { locationX: 40 },
    });

    // 40px at the default 20px/s is 2s.
    expect(screen.getByText('0:02')).toBeTruthy();
  });

  it('exposes an agent handler while mounted and removes it on unmount', async () => {
    const view = renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    expect(handler.getSnapshot()).toMatchObject({
      sequenceId: SEQ_ID,
      title: 'My Sequence',
      durationMs: 9000,
      trackCount: 2,
      clipCount: 2,
      markers: [{ id: 'm1', timeMs: 2000, label: 'Cut' }],
    });

    act(() => {
      handler.selectClip('Theme');
    });
    expect(screen.getByLabelText('Close clip details')).toBeTruthy();

    view.unmount();
    expect(() => getDocumentHandler('timeline', SEQ_ID)).toThrow(/is open/);
  });

  it('shows an empty state when the sequence has no clips', async () => {
    mockRead.mockResolvedValue(
      detail({ tracks: sequence.tracks, clips: [], markers: [] }),
    );

    renderScreen();

    expect(
      await screen.findByText(/This sequence has no clips yet/),
    ).toBeTruthy();
    // The empty state has to say the screen is not touch-editable, and point at
    // the thing that is.
    expect(
      screen.getByText(/ask the assistant to change the sequence/),
    ).toBeTruthy();
    expect(screen.getByLabelText('Ask the assistant')).toBeTruthy();
  });

  it('shows the error with a retry that reloads', async () => {
    mockRead.mockRejectedValueOnce(new Error('Sequence not found'));

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Retry loading timeline'));

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Video 1')).toBeTruthy();
  });
  // ── Agent edits and saving ───────────────────────────────────────────────

  it('starts clean with Save disabled, and enables it after an agent edit', async () => {
    const view = renderScreen();
    await view.findByLabelText(/^Clip Opening shot/);

    expect(saveButton().accessibilityState).toEqual({ disabled: true });

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    await act(async () => {
      await handler.moveClip('Opening shot', { startMs: 3000 });
    });

    // The edit repaints the screen the user is holding.
    expect(view.getByLabelText(/^Clip Opening shot, video, 0:03/)).toBeTruthy();
    expect(view.getByLabelText('Unsaved changes')).toBeTruthy();
    expect(saveButton().accessibilityState).toEqual({ disabled: false });
    expect(handler.getSnapshot().dirty).toBe(true);
  });

  it('saves through the same path as the Save button', async () => {
    mockUpdate.mockResolvedValue(detail(sequence));
    const view = renderScreen();
    await view.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    await act(async () => {
      await handler.addMarker({ timeMs: 5000, label: 'Beat' });
    });

    const button = renderHeaderRight().getByLabelText('Save timeline');
    await act(async () => {
      fireEvent.press(button);
    });

    // The revision read on load is echoed back so a stale write is rejected.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { kind: 'timeline', id: SEQ_ID, revision: 3 },
      }),
    );
    const written = mockUpdate.mock.calls[0][0] as {
      document: TimelineDocument;
    };
    expect(written.document.markers).toHaveLength(2);
    expect(view.queryByLabelText('Unsaved changes')).toBeNull();
  });

  it('saves an edit queued before the save call', async () => {
    renderScreen();
    await screen.findByText('Video 1');
    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    mockUpdate.mockImplementation(async (input) => ({
      ...detail(input.document),
      ref: { kind: 'timeline', id: SEQ_ID, revision: 4 },
    }));
    await act(async () => {
      const edit = handler.addMarker({ timeMs: 3000, label: 'Queued' });
      const saved = handler.save();
      await Promise.all([edit, saved]);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].document.markers).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Queued' })]),
    );
    expect(handler.getSnapshot().dirty).toBe(false);
  });

  it('ui_timeline_save rethrows when the write is rejected', async () => {
    mockUpdate.mockRejectedValue(
      new Error('Sequence was modified concurrently'),
    );
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    await act(async () => {
      await handler.addMarker({ timeMs: 5000, label: 'Beat' });
    });

    await expect(handler.save()).rejects.toThrow(/modified concurrently/);

    // And the user gets a way out that does not just retry into the same wall.
    expect(
      await screen.findByLabelText('Timeline changed elsewhere'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reload timeline'));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
  });

  it('does not reload over unsaved edits when the screen remounts', async () => {
    const view = renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    await act(async () => {
      await getDocumentHandler<TimelineAgentHandler>(
        'timeline',
        SEQ_ID,
      ).addMarker({
        timeMs: 5000,
      });
    });
    view.unmount();

    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    // Still one read: a fresh fetch would have discarded the agent's edit.
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
  });

  it('keeps the failed edits on screen when a save fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Disk full'));
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    await act(async () => {
      await handler.addTextClip({ text: 'Chapter One' });
    });
    await act(async () => {
      await expect(handler.save()).rejects.toThrow(/Disk full/);
    });

    // The banner reports it; the timeline (and the new clip) stay visible.
    expect(screen.getByText('Disk full')).toBeTruthy();
    expect(screen.getByLabelText(/^Clip Chapter One, text/)).toBeTruthy();
  });

  it('refuses to split a transcript-owned clip, naming the line', async () => {
    mockRead.mockResolvedValue(
      detail({
        ...sequence,
        transcript: [
          {
            id: 'line-1',
            text: 'And then we cut away.',
            beatStartMs: 0,
            clipIds: ['c1'],
          },
        ],
      }),
    );
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );

    await expect(handler.splitClip('c1', 2000)).rejects.toThrow(
      /transcript line "And then we cut away\." \(line-1\)/,
    );
    expect(handler.getSnapshot().dirty).toBe(false);
  });

  it('splits at the playhead when no time is given', async () => {
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    act(() => {
      handler.seek(2500);
    });
    const halves = await handler.splitClip('c1');

    expect(halves.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [0, 2500],
      [2500, 1500],
    ]);
  });

  it('places a media clip from an asset:// URI, resolved through assets.get', async () => {
    mockAssetGet.mockResolvedValue({
      id: 'asset-9',
      name: 'Drone pass',
      content_type: 'video/mp4',
      duration: 6.4,
    });
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    let clip: TimelineClipNode | undefined;
    await act(async () => {
      clip = await handler.addMediaClip({
        asset: 'asset://asset-9.mp4',
        trackId: 't1',
      });
    });

    expect(mockAssetGet).toHaveBeenCalledWith({ id: 'asset-9' });
    expect(clip).toMatchObject({ name: 'Drone pass', durationMs: 6400 });
    expect(screen.getByLabelText(/^Clip Drone pass, video/)).toBeTruthy();
  });

  it('says which asset was not found when assets.get resolves to nothing', async () => {
    mockAssetGet.mockResolvedValue(null);
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    await act(async () => {
      await expect(
        handler.addMediaClip({ asset: 'asset-missing' }),
      ).rejects.toThrow(/No asset found for "asset-missing"/);
    });
    expect(handler.getSnapshot().dirty).toBe(false);
  });

  it('renames the document', async () => {
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>(
      'timeline',
      SEQ_ID,
    );
    act(() => {
      handler.rename('Trailer v2');
    });

    expect(handler.getSnapshot()).toMatchObject({
      title: 'Trailer v2',
      dirty: true,
    });
  });
});

describe('shared fixtures through mounted mobile tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentStores();
    resetDocumentHandlers();
  });
  afterEach(() => jest.restoreAllMocks());
  const unsupported = FIXTURES.filter(
    (fixture) => !MobileToolRegistry.has(`ui_timeline_${fixture.tool}`),
  ).map((fixture) => fixture.tool);
  it('enumerates unsupported host operations', () => {
    expect(unsupported).toEqual([
      'generate_from_beats',
      'add_midi_clip',
      'set_notes',
      'set_tempo',
      'set_track_instrument',
      'transpose_clip',
      'quantize_notes',
      'scale_velocity',
      'set_reframe_subject',
      'add_reframe_keyframe',
      'clear_reframe',
      'retarget_format',
      'stagger_animations',
      'set_setup',
      'plan_beats',
      'update_beat',
      'remove_beat',
      'move_track',
      'delete_track',
      'add_model3d_clip',
      'set_model3d_style',
      'bake_model3d_clip',
      'generate_clip',
      'apply_transition_at_cut',
      'set_baked_animation',
      'set_generated_matte',
      'insert_composition',
      'list_takes',
      'select_take',
      'rename_take',
      'delete_take',
      'list_tracks',
      'delete_track_object',
      'bind_to_track',
      'unbind_track',
    ]);
  });
  for (const fixture of FIXTURES.filter((fixture) =>
    MobileToolRegistry.has(`ui_timeline_${fixture.tool}`),
  )) {
    it(fixture.tool, async () => {
      const state = directState();
      const context = directContext(state);
      const minted: string[] = [];
      const mint = context.newId;
      context.newId = (kind) => {
        const id = mint(kind);
        minted.push(id);
        return id;
      };
      let op = fixture.op;
      let args = { ...fixture.args };
      // Mobile's shape argument is structured and its authored names are lowercase.
      if (op.op === 'add_text_clip') {
        args = { ...args, style: { fontSizePx: 48 } };
      }
      if (op.op === 'add_shape_clip') {
        const shape = resolveShapeArg(op.shape, op.shapeStyle, op.loose ?? {});
        op = { ...op, name: shape.kind };
        args = { shape };
      }
      let internalId = 0;
      jest
        .spyOn(TimelineDefaults, 'createTimeOrderedUuid')
        .mockImplementation((...input: unknown[]) => {
          if (!input.length) return `internal_${++internalId}`;
          const id = minted.shift();
          if (!id) throw new Error('Unexpected ID allocation');
          return id;
        });
      const expected = await applyTimelineOp(state, op, context);
      expect(expected.error).toBeUndefined();
      internalId = 0;
      mockRead.mockResolvedValue(
        detail({ ...state, setup: state.setup ?? undefined }),
      );
      mockAssetGet.mockResolvedValue({
        id: 'asset_1',
        name: 'Clip.mp4',
        content_type: 'video/mp4',
        duration: 2.5,
      });
      renderScreen();
      await waitFor(() =>
        expect(
          getDocumentHandler<TimelineAgentHandler>(
            'timeline',
            SEQ_ID,
          ).getSnapshot().clipCount,
        ).toBe(state.clips.length),
      );
      await act(async () => {
        await MobileToolRegistry.call(
          `ui_timeline_${fixture.tool}`,
          { timeline_id: SEQ_ID, ...args },
          fixture.tool,
        );
      });
      const actual = documentStore<TimelineDocument>(
        'timeline',
        SEQ_ID,
      ).getState().doc;
      expect(actual?.tracks).toEqual(expected.state.tracks);
      expect(actual?.clips).toEqual(expected.state.clips);
      expect(actual?.markers).toEqual(expected.state.markers);
      expect(actual?.mediaTracks).toEqual(expected.state.mediaTracks);
    });
  }
});
