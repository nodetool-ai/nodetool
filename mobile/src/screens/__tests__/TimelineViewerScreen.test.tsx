import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import TimelineViewerScreen from '../TimelineViewerScreen';
import type { RootStackParamList } from '../../navigation/types';
import { resetDocumentStores } from '../../documents/documentStore';
import { listOpenDocuments, resetDocumentHandlers } from '../../documents/agentBridge';
import { buildUiContext } from '../../documents/uiContext';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number';
import type { TimelineDocument } from '../../documents/timelineTypes';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The stack's focus effect reduces to a plain effect in tests. Each live one is
// kept so a test can fire focus again, as returning from another screen does.
const mockFocusEffects = new Set<() => void | (() => void)>();
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const react = require('react');
    react.useEffect(() => {
      mockFocusEffects.add(effect);
      const cleanup = effect();
      return () => {
        mockFocusEffects.delete(effect);
        if (typeof cleanup === 'function') {
          cleanup();
        }
      };
    }, [effect]);
  },
}));

const refocus = () => {
  for (const effect of [...mockFocusEffects]) {
    effect();
  }
};

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

  it('names the open sequence in ui_context while mounted, with no edit handler', async () => {
    const view = renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);

    expect(listOpenDocuments()).toEqual([
      { kind: 'timeline', id: SEQ_ID, title: 'My Sequence' },
    ]);
    fireEvent.press(screen.getByLabelText(/^Clip Theme/));
    expect(buildUiContext()).toMatchObject({
      focused: { type: 'timeline', id: SEQ_ID },
      selection: { clip_ids: ['c2'] },
    });

    view.unmount();
    expect(listOpenDocuments()).toEqual([]);
  });

  it('shows an empty state when the sequence has no clips', async () => {
    mockRead.mockResolvedValue(detail({ tracks: sequence.tracks, clips: [], markers: [] }));

    renderScreen();

    expect(await screen.findByText(/This sequence has no clips yet/)).toBeTruthy();
    // The empty state has to say the screen does not edit, and point at what does.
    expect(screen.getByText(/edited in the desktop or\s+web app, or by the assistant/)).toBeTruthy();
    expect(screen.getByLabelText('Ask the assistant')).toBeTruthy();
  });

  it('shows the error with a retry that reloads', async () => {
    mockRead.mockRejectedValueOnce(new Error('Sequence not found'));

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Retry loading timeline'));

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Video 1')).toBeTruthy();
  });
  it('is view only: the header has the chat action and no Save', async () => {
    const view = renderScreen();
    await view.findByLabelText(/^Clip Opening shot/);

    const header = renderHeaderRight();
    expect(header.getByLabelText('Ask the assistant about this sequence')).toBeTruthy();
    expect(header.queryByLabelText('Save timeline')).toBeNull();
    expect(view.queryByLabelText('Unsaved changes')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reads the document again when the screen gets focus', async () => {
    renderScreen();
    await screen.findByLabelText(/^Clip Opening shot/);
    expect(mockRead).toHaveBeenCalledTimes(1);

    // The server agent or the desktop editor moved a clip while the user was
    // in Chat.
    const moved: TimelineDocument = {
      ...sequence,
      clips: sequence.clips.map((clip) =>
        clip.id === 'c1' ? { ...clip, startMs: 2000 } : clip
      ),
    };
    mockRead.mockResolvedValue(detail(moved));

    await act(async () => {
      refocus();
    });

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByLabelText('Clip Opening shot, video, 0:02 to 0:06')
    ).toBeTruthy();
  });
});
