/**
 * Tests for DocumentViewerScreen — the generic fallback surface.
 *
 * The per-document Zustand store is mocked, so the screen's three states
 * (loading, loaded summary, failure) can be driven directly.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';

import DocumentViewerScreen from '../DocumentViewerScreen';
import type { DocumentStatus } from '../../documents/documentStore';

interface MockState {
  doc: unknown;
  name: string;
  status: DocumentStatus;
  error: string | null;
  updatedAt: string | null;
  load: () => Promise<void>;
}

let mockState: MockState;

jest.mock('../../documents/documentStore', () => ({
  documentStore:
    () =>
    <T,>(selector: (state: MockState) => T) =>
      selector(mockState),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const load = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
};

const route = {
  key: 'DocumentViewer-1',
  name: 'DocumentViewer' as const,
  params: { kind: 'sketch', id: 'sk-1', name: 'Doodle' },
};

function renderScreen() {
  return render(
    <DocumentViewerScreen navigation={navigation as never} route={route as never} />
  );
}

describe('DocumentViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = {
      doc: {
        strokes: [{ id: 's1' }, { id: 's2' }],
        background: '#FFFFFF',
        meta: { author: 'agent' },
      },
      name: 'Doodle',
      status: 'idle',
      error: null,
      updatedAt: '2026-07-26T10:00:00.000Z',
      load,
    };
  });

  it('loads the document on mount and titles the header', () => {
    renderScreen();

    expect(load).toHaveBeenCalled();
    expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Doodle' });
  });

  it('summarizes top-level fields and shows the raw JSON', () => {
    renderScreen();

    expect(screen.getByText('strokes')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('#FFFFFF')).toBeTruthy();
    expect(screen.getByText('1 field(s)')).toBeTruthy();
    expect(screen.getByText(/"strokes"/)).toBeTruthy();
  });

  it('explains that the kind has no dedicated screen', () => {
    renderScreen();

    expect(screen.getByText(/no dedicated mobile screen yet/)).toBeTruthy();
  });

  it('shows a spinner while the first load is in flight', () => {
    mockState = { ...mockState, doc: null, status: 'loading' };
    renderScreen();

    expect(screen.getByText('Loading Sketch...')).toBeTruthy();
  });

  it('offers a retry when the load failed', () => {
    mockState = { ...mockState, doc: null, status: 'error', error: 'boom' };
    renderScreen();

    expect(screen.getByText('Could not load Sketch')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();

    load.mockClear();
    fireEvent.press(screen.getByLabelText('Retry loading document'));
    expect(load).toHaveBeenCalled();
  });
});
