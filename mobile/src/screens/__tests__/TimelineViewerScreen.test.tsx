import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import TimelineViewerScreen from '../TimelineViewerScreen';
import type { RootStackParamList } from '../../navigation/types';
import { resetDocumentStores } from '../../documents/documentStore';
import { getDocumentHandler, resetDocumentHandlers } from '../../documents/agentBridge';
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

jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: { read: { query: (input: unknown) => mockRead(input) } },
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
      versions: [{ id: 'v1' }, { id: 'v2' }],
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

const navigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as Props['navigation'];

const route = {
  key: 'TimelineViewer-1',
  name: 'TimelineViewer',
  params: { id: SEQ_ID, name: 'Seed name' },
} as Props['route'];

const renderScreen = () =>
  render(<TimelineViewerScreen navigation={navigation} route={route} />);

const widthOf = (label: string): number | undefined => {
  const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
  return typeof style.width === 'number' ? style.width : undefined;
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

    expect(await screen.findByText('This sequence has no clips yet.')).toBeTruthy();
  });

  it('shows the error with a retry that reloads', async () => {
    mockRead.mockRejectedValueOnce(new Error('Sequence not found'));

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Retry loading timeline'));

    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Video 1')).toBeTruthy();
  });
});
