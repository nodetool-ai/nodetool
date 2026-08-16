/**
 * Tests for DocumentsScreen — the tabless documents browser.
 *
 * The document hooks are mocked so the list, the kind filter, and the
 * registry-driven navigation can be exercised without a server.
 */

import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

import DocumentsScreen from '../DocumentsScreen';
import {
  useAllDocuments,
  useCreateDocument,
  useDeleteDocument,
  useRenameDocument,
  type DocumentListEntry,
} from '../../documents/useDocuments';

jest.mock('../../documents/useDocuments', () => ({
  useAllDocuments: jest.fn(),
  useCreateDocument: jest.fn(),
  useRenameDocument: jest.fn(),
  useDeleteDocument: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockedUseAllDocuments = useAllDocuments as jest.MockedFunction<
  typeof useAllDocuments
>;
const mockedUseCreateDocument = useCreateDocument as jest.Mock;
const mockedUseRenameDocument = useRenameDocument as jest.Mock;
const mockedUseDeleteDocument = useDeleteDocument as jest.Mock;

const DOCUMENTS: DocumentListEntry[] = [
  {
    kind: 'storyboard',
    id: 'sb-1',
    name: 'Board A',
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    kind: 'timeline',
    id: 'tl-1',
    name: 'Cut One',
    updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    kind: 'sketch',
    id: 'sk-1',
    name: 'Doodle',
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
];

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
};

const refetch = jest.fn();
const createMutateAsync = jest.fn();
const renameMutateAsync = jest.fn();
const deleteMutate = jest.fn();

type ListResult = ReturnType<typeof useAllDocuments>;

function listResult(overrides: Partial<ListResult> = {}): ListResult {
  return {
    documents: DOCUMENTS,
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch,
    ...overrides,
  } as ListResult;
}

function renderScreen() {
  return render(<DocumentsScreen navigation={navigation as never} />);
}

/** Pull a button out of the last Alert.alert call by its label. */
function alertButton(callIndex: number, text: string): AlertButton {
  const spy = jest.mocked(Alert.alert);
  const buttons = spy.mock.calls[callIndex][2] as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === text);
  if (!button) {
    throw new Error(`No "${text}" button in alert ${callIndex}`);
  }
  return button;
}

describe('DocumentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockedUseAllDocuments.mockReturnValue(listResult());
    mockedUseCreateDocument.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    });
    mockedUseRenameDocument.mockReturnValue({
      mutateAsync: renameMutateAsync,
      isPending: false,
    });
    mockedUseDeleteDocument.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    });
  });

  it('renders documents of every kind', () => {
    renderScreen();

    expect(screen.getByLabelText('Open Board A, Storyboard')).toBeTruthy();
    expect(screen.getByLabelText('Open Cut One, Timeline')).toBeTruthy();
    expect(screen.getByLabelText('Open Doodle, Sketch')).toBeTruthy();
  });

  it('shows a relative updated-at stamp and a read-only hint for viewer kinds', () => {
    renderScreen();

    expect(screen.getByText('Storyboard · 2h ago')).toBeTruthy();
    // Timeline and sketch both open read-only.
    expect(screen.getAllByText('Read-only')).toHaveLength(2);
  });

  it('narrows the list to the selected kind', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Filter by Timelines'));

    expect(screen.getByLabelText('Open Cut One, Timeline')).toBeTruthy();
    expect(screen.queryByLabelText('Open Board A, Storyboard')).toBeNull();
    expect(screen.queryByLabelText('Open Doodle, Sketch')).toBeNull();

    fireEvent.press(screen.getByLabelText('Filter by All'));
    expect(screen.getByLabelText('Open Board A, Storyboard')).toBeTruthy();
  });

  it('navigates to the route the kind registry maps', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Open Board A, Storyboard'));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryboardEditor', {
      id: 'sb-1',
      name: 'Board A',
    });

    fireEvent.press(screen.getByLabelText('Open Cut One, Timeline'));
    expect(navigation.navigate).toHaveBeenCalledWith('TimelineViewer', {
      id: 'tl-1',
      name: 'Cut One',
    });

    fireEvent.press(screen.getByLabelText('Open Doodle, Sketch'));
    expect(navigation.navigate).toHaveBeenCalledWith('SketchViewer', {
      id: 'sk-1',
      name: 'Doodle',
    });
  });

  it('confirms before deleting', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Actions for Board A'));
    alertButton(0, 'Delete').onPress?.();

    // The action menu only opens the confirmation; nothing is deleted yet.
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(jest.mocked(Alert.alert).mock.calls[1][0]).toBe(
      'Delete document?'
    );

    alertButton(1, 'Delete').onPress?.();

    expect(deleteMutate).toHaveBeenCalledWith(
      { kind: 'storyboard', id: 'sb-1' },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('renames through the modal', async () => {
    renameMutateAsync.mockResolvedValue({
      kind: 'storyboard',
      id: 'sb-1',
      name: 'Board B',
    });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Actions for Board A'));
    act(() => {
      alertButton(0, 'Rename').onPress?.();
    });

    const input = await screen.findByLabelText('Document name');
    fireEvent.changeText(input, 'Board B');
    fireEvent.press(screen.getByLabelText('Save rename'));

    await waitFor(() => {
      expect(renameMutateAsync).toHaveBeenCalledWith({
        kind: 'storyboard',
        id: 'sb-1',
        name: 'Board B',
      });
    });
  });

  it('creates a storyboard and opens it', async () => {
    createMutateAsync.mockResolvedValue({
      kind: 'storyboard',
      id: 'sb-new',
      name: 'New Storyboard',
      updatedAt: '2026-07-26T00:00:00.000Z',
    });
    renderScreen();

    fireEvent.press(screen.getByLabelText('New Storyboard'));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        kind: 'storyboard',
        name: 'New Storyboard',
      });
    });
    expect(navigation.navigate).toHaveBeenCalledWith('StoryboardEditor', {
      id: 'sb-new',
      name: 'New Storyboard',
    });
  });

  it('points an empty library at the assistant', () => {
    mockedUseAllDocuments.mockReturnValue(listResult({ documents: [] }));
    renderScreen();

    expect(screen.getByText('No documents yet')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open chat with the assistant'));
    expect(navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  it('shows a spinner while loading', () => {
    mockedUseAllDocuments.mockReturnValue(
      listResult({ documents: [], isLoading: true })
    );
    renderScreen();

    expect(screen.getByText('Loading documents...')).toBeTruthy();
  });

  it('banners a load error and retries', () => {
    mockedUseAllDocuments.mockReturnValue(
      listResult({ error: new Error('offline') })
    );
    renderScreen();

    expect(screen.getByText('offline')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Retry loading documents'));
    expect(refetch).toHaveBeenCalled();
  });
});
