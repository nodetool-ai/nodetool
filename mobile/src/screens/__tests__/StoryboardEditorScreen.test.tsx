/**
 * Tests for StoryboardEditorScreen.
 *
 * The document store is replaced with a real (but network-free) Zustand store, so
 * the screen exercises the same read/edit/save paths it does in the app without
 * a tRPC client. The agent handler is reached through the real bridge, which is
 * the contract the ui_storyboard_* tools depend on.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { create } from 'zustand';

import StoryboardEditorScreen from '../StoryboardEditorScreen';
import {
  getDocumentHandler,
  resetDocumentHandlers,
} from '../../documents/agentBridge';
import type {
  StoryboardAgentHandler,
  StoryboardDocument,
} from '../../documents/storyboardTypes';
import type { DocumentState } from '../../documents/documentStore';

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactModule = require('react');
    ReactModule.useEffect(callback, [callback]);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { apiService } from '../../services/api';

// Real `apiService`; only URL resolution is pinned to a stable test host.
jest.spyOn(apiService, 'resolveUrl').mockImplementation((path) =>
  path ? `https://example.test${path}` : null
);

const saveMock = jest.fn(async () => {});
const loadMock = jest.fn(async () => {});
const revertMock = jest.fn(async () => {});

type TestState = DocumentState<StoryboardDocument>;

const makeDocument = (
  overrides: Partial<StoryboardDocument> = {}
): StoryboardDocument => ({
  screenplay: null,
  shots: [
    {
      type: 'shot',
      id: 'shot-a',
      index: 0,
      action: 'A lighthouse at dusk',
      slug: 'Lighthouse',
      status: 'planned',
      keyframe: { type: 'image', uri: '/api/assets/key.png' },
    },
    {
      type: 'shot',
      id: 'shot-b',
      index: 1,
      action: 'Waves break on the rocks',
      status: 'keyframe_ready',
    },
  ],
  brief: 'A storm rolls in',
  style: 'grainy 16mm',
  entityIds: [],
  aspectRatio: '16:9',
  directorModel: null,
  imageModel: null,
  videoModel: null,
  ...overrides,
});

let mockStore: ReturnType<typeof makeStore>;

function makeStore(overrides: Partial<TestState> = {}) {
  return create<TestState>((set, get) => ({
    kind: 'storyboard',
    id: 'sb-1',
    doc: makeDocument(),
    name: 'Test board',
    token: 3,
    updatedAt: '2026-07-26T00:00:00Z',
    dirty: false,
    status: 'idle',
    error: null,
    load: loadMock,
    edit: (mutate) => {
      const current = get().doc;
      if (current === null) {
        return;
      }
      set({ doc: mutate(current), dirty: true });
    },
    rename: (name) => set({ name, dirty: true }),
    save: saveMock,
    revert: revertMock,
    ...overrides,
  }));
}

jest.mock('../../documents/documentStore', () => ({
  documentStore: () => mockStore,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const navigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
};

const route = { params: { id: 'sb-1', name: 'Test board' } };

const renderScreen = () =>
  render(
    <StoryboardEditorScreen
      navigation={navigation as never}
      route={route as never}
    />
  );

/** The header component the screen last handed to the navigator. */
const renderHeaderRight = () => {
  const calls = navigation.setOptions.mock.calls;
  const options = calls[calls.length - 1][0] as {
    headerRight: () => React.ReactElement;
  };
  const HeaderRight = options.headerRight;
  return render(<HeaderRight />);
};

describe('StoryboardEditorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentHandlers();
    mockStore = makeStore();
  });

  it('renders every shot from the loaded document', () => {
    renderScreen();

    expect(screen.getByDisplayValue('A lighthouse at dusk')).toBeTruthy();
    expect(screen.getByDisplayValue('Waves break on the rocks')).toBeTruthy();
    expect(screen.getByLabelText('Shot 1 action')).toBeTruthy();
    expect(screen.getByLabelText('Shot 2 action')).toBeTruthy();
  });

  it('renders the board fields and the keyframe thumbnail', () => {
    renderScreen();

    expect(screen.getByDisplayValue('A storm rolls in')).toBeTruthy();
    expect(screen.getByDisplayValue('grainy 16mm')).toBeTruthy();
    expect(screen.getByDisplayValue('16:9')).toBeTruthy();
    expect(screen.getByLabelText('Keyframe for shot 1').props.source).toEqual({
      uri: 'https://example.test/api/assets/key.png',
    });
  });

  it('loads the document when it is not in the store yet', () => {
    mockStore = makeStore({ doc: null, status: 'loading' });

    renderScreen();

    expect(loadMock).toHaveBeenCalled();
  });

  it('marks the document dirty when a field is edited', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Board brief'), 'A calm morning');

    expect(mockStore.getState().doc?.brief).toBe('A calm morning');
    expect(mockStore.getState().dirty).toBe(true);
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
  });

  it('edits a shot action in place', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Shot 2 action'), 'Rain on glass');

    expect(mockStore.getState().doc?.shots[1].action).toBe('Rain on glass');
  });

  it('reorders shots with the move buttons and renumbers them', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Move shot 2 up'));

    const shots = mockStore.getState().doc?.shots ?? [];
    expect(shots.map((shot) => shot.id)).toEqual(['shot-b', 'shot-a']);
    expect(shots.map((shot) => shot.index)).toEqual([0, 1]);
  });

  it('deletes a shot', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Delete shot 1'));

    expect(mockStore.getState().doc?.shots.map((shot) => shot.id)).toEqual([
      'shot-b',
    ]);
  });

  it('adds a shot', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add shot'));

    expect(mockStore.getState().doc?.shots).toHaveLength(3);
  });

  it('saves through the store when the header button is pressed', () => {
    mockStore = makeStore({ dirty: true });
    renderScreen();

    fireEvent.press(renderHeaderRight().getByLabelText('Save storyboard'));

    expect(saveMock).toHaveBeenCalled();
  });

  it('disables the save button while the document is clean', () => {
    renderScreen();

    const button = renderHeaderRight().getByLabelText('Save storyboard');
    fireEvent.press(button);

    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('shows a spinner on the save button while saving', () => {
    mockStore = makeStore({ dirty: true, status: 'saving' });
    renderScreen();

    const header = renderHeaderRight();
    expect(header.queryByText('Save')).toBeNull();
    expect(
      header.getByLabelText('Save storyboard').props.accessibilityState.disabled
    ).toBe(true);
  });

  it('offers a reload on a save conflict', () => {
    mockStore = makeStore({
      dirty: true,
      status: 'conflict',
      error: 'Row was modified since it was read',
    });
    renderScreen();

    expect(screen.getByLabelText('Storyboard changed elsewhere')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reload storyboard'));

    expect(revertMock).toHaveBeenCalled();
  });

  it('shows the agent-first empty state and routes to chat', () => {
    mockStore = makeStore({ doc: makeDocument({ shots: [] }) });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Ask the assistant'));

    expect(navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  describe('agent handler', () => {
    const handler = (): StoryboardAgentHandler =>
      getDocumentHandler<StoryboardAgentHandler>('storyboard', 'sb-1');

    it('registers on mount and unregisters on unmount', () => {
      const view = renderScreen();

      expect(handler().getSnapshot().shots).toHaveLength(2);

      view.unmount();
      expect(() => handler()).toThrow(/No storyboard "sb-1" is open/);
    });

    it('snapshots the board the way the tools report it', () => {
      renderScreen();

      const snapshot = handler().getSnapshot();
      expect(snapshot).toMatchObject({
        boardId: 'sb-1',
        title: 'Test board',
        brief: 'A storm rolls in',
        style: 'grainy 16mm',
        aspectRatio: '16:9',
        hasScreenplay: false,
        selectedShotId: null,
      });
      expect(snapshot.shots[0]).toMatchObject({
        id: 'shot-a',
        index: 0,
        hasKeyframe: true,
        hasClip: false,
      });
    });

    it('repaints the screen when the agent adds a shot', () => {
      renderScreen();

      act(() => {
        handler().addShot({ action: 'A gull crosses the beam', index: 0 });
      });

      expect(screen.getByDisplayValue('A gull crosses the beam')).toBeTruthy();
      expect(mockStore.getState().doc?.shots[0].action).toBe(
        'A gull crosses the beam'
      );
    });

    it('resolves shot targets by id, index, and "selected"', () => {
      renderScreen();

      act(() => {
        handler().selectShot('1');
      });
      expect(handler().getSnapshot().selectedShotId).toBe('shot-b');

      act(() => {
        handler().updateShot('selected', { slug: 'Rocks' });
      });
      expect(mockStore.getState().doc?.shots[1].slug).toBe('Rocks');

      act(() => {
        handler().updateShot('shot-a', { motion: 'slow push in' });
      });
      expect(mockStore.getState().doc?.shots[0].motion).toBe('slow push in');
    });

    it('throws a recoverable message for an unknown shot target', () => {
      renderScreen();

      expect(() => handler().updateShot('shot-zzz', { slug: 'x' })).toThrow(
        /No shot matches "shot-zzz".*Shot ids: shot-a, shot-b/s
      );
    });

    it('reorders and removes shots through the bridge', () => {
      renderScreen();

      act(() => {
        handler().reorderShot('shot-b', 0);
      });
      expect(mockStore.getState().doc?.shots.map((shot) => shot.id)).toEqual([
        'shot-b',
        'shot-a',
      ]);

      act(() => {
        handler().removeShot('0');
      });
      expect(mockStore.getState().doc?.shots.map((shot) => shot.id)).toEqual([
        'shot-a',
      ]);
    });

    it('saves through the store and reports the new updatedAt', async () => {
      renderScreen();

      await expect(handler().save()).resolves.toEqual({
        ok: true,
        updatedAt: '2026-07-26T00:00:00Z',
      });
      expect(saveMock).toHaveBeenCalled();
    });

    it('surfaces a conflict as a thrown error the agent can report', async () => {
      mockStore = makeStore({
        dirty: true,
        status: 'conflict',
        error: 'Row was modified since it was read',
      });
      renderScreen();

      await expect(handler().save()).rejects.toThrow(/modified since/);
    });
  });
});
