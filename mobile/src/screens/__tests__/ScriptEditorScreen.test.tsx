/**
 * Tests for ScriptEditorScreen.
 *
 * The document store is replaced with a real (but network-free) Zustand store, so
 * the screen exercises the same read/edit/save paths it does in the app without
 * a tRPC client. The agent handler is reached through the real bridge, which is
 * the contract the ui_script_* tools depend on.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { create } from 'zustand';

import ScriptEditorScreen from '../ScriptEditorScreen';
import {
  getDocumentHandler,
  resetDocumentHandlers,
} from '../../documents/agentBridge';
import {
  flattenLines,
  type ScriptAgentHandler,
  type ScriptDocument,
  type ScriptTake,
} from '../../documents/scriptTypes';
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

const saveMock = jest.fn(async () => {});
const loadMock = jest.fn(async () => {});
const revertMock = jest.fn(async () => {});

type TestState = DocumentState<ScriptDocument>;

const take = (id: string, textSnapshot: string): ScriptTake => ({
  id,
  assetId: `asset-${id}`,
  durationMs: 900,
  words: [],
  textSnapshot,
  voiceSnapshot: null,
  createdAt: '2026-07-26T00:00:00Z',
});

const makeDocument = (
  overrides: Partial<ScriptDocument> = {}
): ScriptDocument => ({
  cast: [
    { id: 'speaker-a', name: 'Ada', color: '#6DB3F8' },
    { id: 'speaker-b', name: 'Grace' },
  ],
  sections: [
    {
      id: 'section-1',
      title: 'Cold open',
      lines: [
        {
          id: 'line-a',
          speakerId: 'speaker-a',
          text: 'The lamp still turns',
          takes: [take('take-1', 'The lamp still turns')],
          currentTakeId: 'take-1',
        },
        {
          id: 'line-b',
          speakerId: 'speaker-b',
          text: 'Not for much longer',
          direction: 'flat',
          takes: [],
          currentTakeId: null,
        },
      ],
    },
    {
      id: 'section-2',
      title: 'Act 2',
      lines: [
        {
          id: 'line-c',
          speakerId: null,
          text: 'Rain on the glass',
          takes: [],
          currentTakeId: null,
        },
      ],
    },
  ],
  ...overrides,
});

let mockStore: ReturnType<typeof makeStore>;

function makeStore(overrides: Partial<TestState> = {}) {
  return create<TestState>((set, get) => ({
    kind: 'script',
    id: 'sc-1',
    doc: makeDocument(),
    name: 'Test script',
    token: '2026-07-26T00:00:00Z',
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

const route = { params: { id: 'sc-1', name: 'Test script' } };

const renderScreen = () =>
  render(
    <ScriptEditorScreen
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

const lineIds = (): string[] =>
  flattenLines(mockStore.getState().doc as ScriptDocument).map(
    (entry) => entry.line.id
  );

describe('ScriptEditorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentHandlers();
    mockStore = makeStore();
  });

  it('renders every section, line, and cast member', () => {
    renderScreen();

    expect(screen.getByDisplayValue('Cold open')).toBeTruthy();
    expect(screen.getByDisplayValue('Act 2')).toBeTruthy();
    expect(screen.getByDisplayValue('The lamp still turns')).toBeTruthy();
    expect(screen.getByDisplayValue('Not for much longer')).toBeTruthy();
    expect(screen.getByDisplayValue('Rain on the glass')).toBeTruthy();
    expect(screen.getByLabelText('Speaker 1 name')).toBeTruthy();
    expect(screen.getByLabelText('Line 3 text')).toBeTruthy();
  });

  it('shows each line status with its take count', () => {
    renderScreen();

    expect(
      screen.getByLabelText('Line 1 status Voiced, 1 takes')
    ).toBeTruthy();
    expect(screen.getByLabelText('Line 2 status Draft, 0 takes')).toBeTruthy();
  });

  it('marks a voiced line stale once its text is edited, keeping the take', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Line 1 text'), 'The lamp is out');

    const line = mockStore.getState().doc?.sections[0].lines[0];
    expect(line?.text).toBe('The lamp is out');
    expect(line?.takes).toHaveLength(1);
    expect(line?.currentTakeId).toBe('take-1');
    expect(screen.getByLabelText('Line 1 status Stale, 1 takes')).toBeTruthy();
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
  });

  it('loads the document when it is not in the store yet', () => {
    mockStore = makeStore({ doc: null, status: 'loading' });

    renderScreen();

    expect(loadMock).toHaveBeenCalled();
  });

  it('does not reload over unsaved edits', () => {
    mockStore = makeStore({ dirty: true });

    renderScreen();

    expect(loadMock).not.toHaveBeenCalled();
  });

  it('edits a line direction in place', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Line 3 direction'), 'urgent');

    expect(mockStore.getState().doc?.sections[1].lines[0].direction).toBe('urgent');
  });

  it('moves a line up across a section boundary', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Move line 3 up'));

    expect(lineIds()).toEqual(['line-a', 'line-c', 'line-b']);
    expect(mockStore.getState().doc?.sections[1].lines).toHaveLength(0);
  });

  it('adds and deletes lines', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add line to section 1'));
    expect(mockStore.getState().doc?.sections[0].lines).toHaveLength(3);

    fireEvent.press(screen.getByLabelText('Delete line 1'));
    expect(lineIds()).not.toContain('line-a');
  });

  it('adds and deletes sections', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add section'));
    expect(mockStore.getState().doc?.sections).toHaveLength(3);

    fireEvent.press(screen.getByLabelText('Delete section 2'));
    expect(
      mockStore.getState().doc?.sections.map((section) => section.id)
    ).not.toContain('section-2');
  });

  it('adds a speaker, renames one, and removes one without orphaning lines', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add speaker'));
    expect(mockStore.getState().doc?.cast).toHaveLength(3);

    fireEvent.changeText(screen.getByLabelText('Speaker 1 name'), 'Ada L');
    expect(mockStore.getState().doc?.cast[0].name).toBe('Ada L');

    fireEvent.press(screen.getByLabelText('Remove speaker 1'));
    expect(
      mockStore.getState().doc?.cast.map((speaker) => speaker.id)
    ).not.toContain('speaker-a');
    expect(mockStore.getState().doc?.sections[0].lines[0].speakerId).toBeNull();
  });

  it('assigns a speaker to the selected line', () => {
    renderScreen();

    const assign = screen.getByLabelText('Assign Grace to the selected line');
    expect(assign.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByLabelText('Select line 3'));
    fireEvent.press(screen.getByLabelText('Assign Grace to the selected line'));

    expect(mockStore.getState().doc?.sections[1].lines[0].speakerId).toBe(
      'speaker-b'
    );
  });

  it('saves through the store when the header button is pressed', () => {
    mockStore = makeStore({ dirty: true });
    renderScreen();

    fireEvent.press(renderHeaderRight().getByLabelText('Save script'));

    expect(saveMock).toHaveBeenCalled();
  });

  it('disables the save button while the document is clean', () => {
    renderScreen();

    const button = renderHeaderRight().getByLabelText('Save script');
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
      header.getByLabelText('Save script').props.accessibilityState.disabled
    ).toBe(true);
  });

  it('offers a reload on a save conflict', () => {
    mockStore = makeStore({
      dirty: true,
      status: 'conflict',
      error: 'Row was modified since it was read',
    });
    renderScreen();

    expect(screen.getByLabelText('Script changed elsewhere')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Reload script'));

    expect(revertMock).toHaveBeenCalled();
  });

  it('retries a failed load', () => {
    mockStore = makeStore({ doc: null, status: 'error', error: 'Network down' });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Retry loading script'));

    expect(loadMock).toHaveBeenCalled();
  });

  it('shows the agent-first empty state and routes to chat', () => {
    mockStore = makeStore({ doc: makeDocument({ sections: [] }) });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Ask the assistant'));

    expect(navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  describe('agent handler', () => {
    const handler = (): ScriptAgentHandler =>
      getDocumentHandler<ScriptAgentHandler>('script', 'sc-1');

    it('registers on mount and unregisters on unmount', () => {
      const view = renderScreen();

      expect(handler().getSnapshot().lines).toHaveLength(3);

      view.unmount();
      expect(() => handler()).toThrow(/No script "sc-1" is open/);
    });

    it('snapshots the script the way the tools report it', () => {
      renderScreen();

      const snapshot = handler().getSnapshot();
      expect(snapshot).toMatchObject({
        scriptId: 'sc-1',
        title: 'Test script',
        selectedLineId: null,
      });
      expect(snapshot.cast).toEqual([
        { id: 'speaker-a', name: 'Ada', color: '#6DB3F8', hasVoice: false },
        { id: 'speaker-b', name: 'Grace', color: undefined, hasVoice: false },
      ]);
      expect(snapshot.sections).toEqual([
        { id: 'section-1', title: 'Cold open', lineIds: ['line-a', 'line-b'] },
        { id: 'section-2', title: 'Act 2', lineIds: ['line-c'] },
      ]);
      expect(snapshot.lines[0]).toMatchObject({
        id: 'line-a',
        index: 0,
        sectionId: 'section-1',
        speakerName: 'Ada',
        status: 'voiced',
        takeCount: 1,
      });
    });

    it('repaints the screen when the agent adds a line', () => {
      renderScreen();

      act(() => {
        handler().addLine({
          text: 'A gull crosses the beam',
          speakerId: 'speaker-a',
          sectionId: 'section-1',
          index: 0,
        });
      });

      expect(screen.getByDisplayValue('A gull crosses the beam')).toBeTruthy();
      expect(lineIds()[0]).not.toBe('line-a');
    });

    it('refuses a line for a speaker that is not in the cast', () => {
      renderScreen();

      expect(() => handler().addLine({ text: 'x', speakerId: 'ghost' })).toThrow(
        /No cast member "ghost" exists.*speaker-a, speaker-b/s
      );
    });

    it('creates a section when the script has none', () => {
      mockStore = makeStore({ doc: makeDocument({ sections: [] }) });
      renderScreen();

      act(() => {
        handler().addLine({ text: 'First words' });
      });

      expect(mockStore.getState().doc?.sections).toHaveLength(1);
      expect(handler().getSnapshot().lines[0].text).toBe('First words');
    });

    it('resolves line targets by id, index, and "selected"', () => {
      renderScreen();

      act(() => {
        handler().selectLine('1');
      });
      expect(handler().getSnapshot().selectedLineId).toBe('line-b');

      act(() => {
        handler().patchLine('selected', { pauseAfterMs: 400 });
      });
      expect(mockStore.getState().doc?.sections[0].lines[1].pauseAfterMs).toBe(400);

      act(() => {
        handler().setLineText('line-c', 'Hail on the glass');
      });
      expect(mockStore.getState().doc?.sections[1].lines[0].text).toBe(
        'Hail on the glass'
      );
    });

    it('throws a recoverable message for an unknown line target', () => {
      renderScreen();

      expect(() => handler().setLineText('line-zzz', 'x')).toThrow(
        /No line matches "line-zzz".*Line ids: line-a, line-b, line-c/s
      );
    });

    it('keeps the takes when the agent rewrites a voiced line', () => {
      renderScreen();

      let node = handler().getSnapshot().lines[0];
      expect(node.status).toBe('voiced');

      act(() => {
        node = handler().setLineText('line-a', 'The lamp is out');
      });

      expect(node).toMatchObject({ status: 'stale', takeCount: 1 });
      expect(mockStore.getState().doc?.sections[0].lines[0].takes).toHaveLength(1);
    });

    it('moves, removes, and reassigns lines through the bridge', () => {
      renderScreen();

      act(() => {
        handler().moveLine('line-c', 0);
      });
      expect(lineIds()).toEqual(['line-c', 'line-a', 'line-b']);

      act(() => {
        handler().setLineSpeaker('line-c', 'speaker-b');
      });
      expect(mockStore.getState().doc?.sections[0].lines[0].speakerId).toBe(
        'speaker-b'
      );

      act(() => {
        handler().removeLine('0');
      });
      expect(lineIds()).toEqual(['line-a', 'line-b']);
    });

    it('manages cast and sections through the bridge', () => {
      renderScreen();

      let speaker = { id: '', name: '', hasVoice: false };
      act(() => {
        speaker = handler().addSpeaker('Hopper', '#f0f');
      });
      expect(mockStore.getState().doc?.cast).toHaveLength(3);

      act(() => {
        handler().renameSpeaker(speaker.id, 'Grace Hopper');
      });
      expect(mockStore.getState().doc?.cast[2].name).toBe('Grace Hopper');

      act(() => {
        handler().removeSpeaker('speaker-a');
      });
      expect(mockStore.getState().doc?.sections[0].lines[0].speakerId).toBeNull();

      act(() => {
        handler().addSection('Act 3', 0);
      });
      expect(mockStore.getState().doc?.sections[0].title).toBe('Act 3');

      act(() => {
        handler().setSectionTitle('section-1', 'Opening');
      });
      expect(mockStore.getState().doc?.sections[1].title).toBe('Opening');

      act(() => {
        handler().removeSection('section-2');
      });
      expect(lineIds()).toEqual(['line-a', 'line-b']);
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
