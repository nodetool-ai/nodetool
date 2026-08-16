import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import TimelineViewerScreen from '../TimelineViewerScreen';
import type { RootStackParamList } from '../../navigation/types';
import { resetDocumentStores } from '../../documents/documentStore';
import { getDocumentHandler, resetDocumentHandlers } from '../../documents/agentBridge';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number';
import type {
  TimelineAgentHandler,
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

jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: {
      read: { query: (input: unknown) => mockRead(input) },
      update: { mutate: (input: unknown) => mockUpdate(input) },
    },
  }),
}));

const SEQ_ID = 'seq-1';

const sequence: TimelineDocument = {
  tracks: [
    { id: 't1', name: 'Video 1', type: 'video', index: 0, visible: true, locked: false },
    { id: 't2', name: 'Music', type: 'audio', index: 1, visible: true, locked: false },
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
      versions: [{
        id: 'v1',
        createdAt: '2026-07-01T00:00:00Z',
        jobId: 'job-v1',
        assetId: 'asset-1',
        workflowUpdatedAt: '2026-07-01T00:00:00Z',
        dependencyHash: 'hash-v1',
        paramOverridesSnapshot: {},
        status: 'success',
      }, {
        id: 'v2',
        createdAt: '2026-07-01T00:00:00Z',
        jobId: 'job-v2',
        assetId: 'asset-2',
        workflowUpdatedAt: '2026-07-01T00:00:00Z',
        dependencyHash: 'hash-v2',
        paramOverridesSnapshot: {},
        status: 'success',
      }],
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
 * The header lives in navigation options rather than in the screen's own tree,
 * so the Save button is read off the last `setOptions` call. The element is
 * walked instead of rendered: a second `render()` would unmount the screen the
 * assertions are about.
 */
const findByLabel = (
  node: React.ReactNode,
  label: string
): React.ReactElement<Record<string, unknown>> | null => {
  if (!React.isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findByLabel(child as React.ReactNode, label);
        if (hit) {
          return hit;
        }
      }
    }
    return null;
  }
  const props = node.props as Record<string, unknown>;
  if (props.accessibilityLabel === label) {
    return node as React.ReactElement<Record<string, unknown>>;
  }
  return findByLabel(props.children as React.ReactNode, label);
};

const headerButton = (label: string): Record<string, unknown> => {
  const calls = jest.mocked(navigation.setOptions).mock.calls as [
    { headerRight?: () => React.ReactElement },
  ][];
  const headerRight = calls[calls.length - 1][0].headerRight;
  if (headerRight === undefined) {
    throw new Error('the screen set no headerRight');
  }
  const found = findByLabel(headerRight(), label);
  if (found === null) {
    throw new Error(`no header button labelled "${label}"`);
  }
  return found.props;
};

const saveButton = () => headerButton('Save timeline');

describe('TimelineViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentStores();
    resetDocumentHandlers();
    mockRead.mockResolvedValue(detail(sequence));
  });

  it('loads the document and renders a lane per track with its clips', async () => {
    renderScreen();

    await waitFor(() => expect(mockRead).toHaveBeenCalledWith({
      ref: { kind: 'timeline', id: SEQ_ID },
    }));

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

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
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
    mockRead.mockResolvedValue(detail({ tracks: sequence.tracks, clips: [], markers: [] }));

    renderScreen();

    expect(await screen.findByText(/This sequence has no clips yet/)).toBeTruthy();
    // The empty state has to say the screen is not touch-editable, and point at
    // the thing that is.
    expect(screen.getByText(/ask the assistant to change the sequence/)).toBeTruthy();
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
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    expect(saveButton().accessibilityState).toEqual({ disabled: true });

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.moveClip('Opening shot', { startMs: 3000 });
    });

    // The edit repaints the screen the user is holding.
    expect(screen.getByLabelText(/^Clip Opening shot, video, 0:03/)).toBeTruthy();
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
    expect(saveButton().accessibilityState).toEqual({ disabled: false });
    expect(handler.getSnapshot().dirty).toBe(true);
  });

  it('saves through the same path as the Save button', async () => {
    mockUpdate.mockResolvedValue(detail(sequence));
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.addMarker({ timeMs: 5000, label: 'Beat' });
    });

    await act(async () => {
      (saveButton().onPress as () => void)();
    });

    // The revision read on load is echoed back so a stale write is rejected.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ref: { kind: 'timeline', id: SEQ_ID, revision: 3 } })
    );
    const written = mockUpdate.mock.calls[0][0] as {
      document: TimelineDocument;
    };
    expect(written.document.markers).toHaveLength(2);
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull();
  });

  it('ui_timeline_save rethrows when the write is rejected', async () => {
    mockUpdate.mockRejectedValue(new Error('Sequence was modified concurrently'));
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.addMarker({ timeMs: 5000, label: 'Beat' });
    });

    await expect(handler.save()).rejects.toThrow(/modified concurrently/);

    // And the user gets a way out that does not just retry into the same wall.
    expect(await screen.findByLabelText('Timeline changed elsewhere')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reload timeline'));
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
  });

  it('does not reload over unsaved edits when the screen remounts', async () => {
    const view = renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    act(() => {
      getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID).addMarker({
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

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.addTextClip({ text: 'Chapter One' });
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
      })
    );
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);

    expect(() => handler.splitClip('c1', 2000)).toThrow(
      /transcript line "And then we cut away\." \(line-1\)/
    );
    expect(handler.getSnapshot().dirty).toBe(false);
  });

  it('splits at the playhead when no time is given', async () => {
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.seek(2500);
    });
    const halves = handler.splitClip('c1');

    expect(halves.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [0, 2500],
      [2500, 1500],
    ]);
  });

  it('renames the document', async () => {
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    const handler = getDocumentHandler<TimelineAgentHandler>('timeline', SEQ_ID);
    act(() => {
      handler.rename('Trailer v2');
    });

    expect(handler.getSnapshot()).toMatchObject({ title: 'Trailer v2', dirty: true });
  });
});
