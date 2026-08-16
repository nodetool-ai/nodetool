/**
 * Tests for JsScriptEditorScreen.
 *
 * The document store is replaced with a real (but network-free) Zustand store,
 * so the screen exercises the same read/edit/save paths it does in the app
 * without a tRPC client, and the run endpoint is mocked at `apiService`. The
 * agent handler is reached through the real bridge, which is the contract the
 * ui_jsscript_* tools depend on.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { create } from 'zustand';

import JsScriptEditorScreen, { parseRunInput } from '../JsScriptEditorScreen';
import {
  getDocumentHandler,
  resetDocumentHandlers,
} from '../../documents/agentBridge';
import {
  emptyJsScriptDocument,
  type JsScriptAgentHandler,
  type JsScriptDocument,
  type JsScriptRunOutcome,
} from '../../documents/jsScriptTypes';
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

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      surface: '#111',
      primary: '#6DB3F8',
      primaryMuted: '#123',
      text: '#fff',
      textSecondary: '#aaa',
      textTertiary: '#777',
      textOnPrimary: '#fff',
      border: '#222',
      borderLight: '#333',
      error: '#f00',
      warning: '#fc0',
      success: '#0c6',
      inputBg: '#222',
      cardBg: '#111',
      accent: '#a7f',
      accentMuted: '#334',
    },
    shadows: { small: {}, medium: {}, large: {} },
  }),
}));

const mockRunJsScript = jest.fn(
  async (
    _scriptId: string,
    _inputs: Record<string, unknown>,
    _inputStreams?: Record<string, unknown[]>
  ): Promise<JsScriptRunOutcome> => ({
    ok: true,
    outputs: { total: 3 },
    logs: ['ran'],
    duration_ms: 12,
  })
);

// Referenced lazily: the factory runs while the module graph is still being
// initialized, so reading the const eagerly would capture it before assignment.
jest.mock('../../services/api', () => ({
  apiService: {
    runJsScript: (...args: Parameters<typeof mockRunJsScript>) =>
      mockRunJsScript(...args),
  },
}));

const saveMock = jest.fn(async () => {});
const loadMock = jest.fn(async () => {});
const revertMock = jest.fn(async () => {});

type TestState = DocumentState<JsScriptDocument>;

const makeDocument = (
  overrides: Partial<JsScriptDocument> = {}
): JsScriptDocument => ({
  ...emptyJsScriptDocument(),
  description: 'Adds the numbers.',
  code: 'await output("total", inputs.numbers.length);',
  inputs: [{ name: 'numbers', type: 'list[int]' }],
  outputs: [{ name: 'total', type: 'int' }],
  tests: [{ name: 'sums', inputs: { numbers: [1, 2] }, expect: { total: 3 } }],
  ...overrides,
});

let mockStore: ReturnType<typeof makeStore>;

function makeStore(overrides: Partial<TestState> = {}) {
  return create<TestState>((set, get) => ({
    kind: 'jsscript',
    id: 'js-1',
    doc: makeDocument(),
    name: 'Sum numbers',
    token: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
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

const route = { params: { id: 'js-1', name: 'Sum numbers' } };

const renderScreen = () =>
  render(
    <JsScriptEditorScreen
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

const handler = (): JsScriptAgentHandler =>
  getDocumentHandler<JsScriptAgentHandler>('jsscript', 'js-1');

describe('parseRunInput', () => {
  it('reads JSON when the field holds JSON', () => {
    expect(parseRunInput('[1, 2]')).toEqual([1, 2]);
    expect(parseRunInput('42')).toBe(42);
    expect(parseRunInput('{"a": 1}')).toEqual({ a: 1 });
  });

  it('reads anything else as the string the user typed', () => {
    expect(parseRunInput('hello')).toBe('hello');
    expect(parseRunInput('  ')).toBe('');
  });
});

describe('JsScriptEditorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentHandlers();
    mockStore = makeStore();
  });

  it('renders the body, metadata, and declared ports', () => {
    renderScreen();

    expect(
      screen.getByDisplayValue('await output("total", inputs.numbers.length);')
    ).toBeTruthy();
    expect(screen.getByDisplayValue('Adds the numbers.')).toBeTruthy();
    expect(screen.getByDisplayValue('numbers')).toBeTruthy();
    expect(screen.getByDisplayValue('total')).toBeTruthy();
    expect(screen.getByLabelText('Inputs 1 name')).toBeTruthy();
    expect(screen.getByLabelText('Outputs 1 type')).toBeTruthy();
  });

  it('edits the body in place and marks the document dirty', () => {
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Script body'),
      'await emit("total", 1);'
    );

    expect(mockStore.getState().doc?.code).toBe('await emit("total", 1);');
    expect(screen.getByLabelText('Unsaved changes')).toBeTruthy();
  });

  it('adds, renames, and removes a port', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add input'));
    expect(mockStore.getState().doc?.inputs).toHaveLength(2);

    fireEvent.changeText(screen.getByLabelText('Inputs 1 name'), 'values');
    expect(mockStore.getState().doc?.inputs[0].name).toBe('values');

    fireEvent.press(screen.getByLabelText('Remove input 2'));
    expect(mockStore.getState().doc?.inputs).toHaveLength(1);
  });

  it('caps the timeout at the sandbox ceiling', () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Run timeout in seconds'), '999');

    expect(mockStore.getState().doc?.timeoutSeconds).toBe(120);
  });

  it('reads the declared secrets out of one comma-separated field', () => {
    renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Declared secrets'),
      'OPENAI_API_KEY, FAL_API_KEY'
    );

    expect(mockStore.getState().doc?.secrets).toEqual([
      'OPENAI_API_KEY',
      'FAL_API_KEY',
    ]);
  });

  it('shows the document-level issues the editor can decide on its own', () => {
    mockStore = makeStore({
      doc: makeDocument({ inputs: [{ name: 'my input', type: 'str' }] }),
    });
    renderScreen();

    expect(
      screen.getByText('input "my input" is not a valid identifier')
    ).toBeTruthy();
  });

  it('saves before running, and runs with the typed inputs', async () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Value for input numbers'), '[1, 2]');
    fireEvent.press(screen.getByLabelText('Run script'));

    await waitFor(() => expect(mockRunJsScript).toHaveBeenCalled());
    // The endpoint runs the saved row, so an unsaved body must be flushed first.
    expect(saveMock).toHaveBeenCalled();
    expect(mockRunJsScript).toHaveBeenCalledWith(
      'js-1',
      { numbers: [1, 2] },
      undefined
    );
    expect(await screen.findByText('Run succeeded')).toBeTruthy();
  });

  it('reports a failed run without claiming the tool call failed', async () => {
    mockRunJsScript.mockResolvedValueOnce({
      ok: false,
      outputs: {},
      logs: [],
      duration_ms: 3,
    });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Run script'));

    expect(await screen.findByText('Run failed')).toBeTruthy();
  });

  it('grades the saved cases and reports the tally', async () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Run saved test cases'));

    expect(await screen.findByText('1 passed, 0 failed')).toBeTruthy();
  });

  it('disables the test button when there are no saved cases', () => {
    mockStore = makeStore({ doc: makeDocument({ tests: [] }) });
    renderScreen();

    const button = screen.getByLabelText('Run saved test cases');
    expect(button.props.accessibilityState.disabled).toBe(true);
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

  it('offers a reload when the server rejected the write as stale', () => {
    mockStore = makeStore({ status: 'conflict', error: 'modified since' });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Reload JS script'));

    expect(revertMock).toHaveBeenCalled();
  });

  it('saves through the store when the header button is pressed', () => {
    mockStore = makeStore({ dirty: true });
    renderScreen();

    fireEvent.press(renderHeaderRight().getByLabelText('Save JS script'));

    expect(saveMock).toHaveBeenCalled();
  });

  describe('agent handler', () => {
    it('writes the body, ports, metadata, and cases through the same store', async () => {
      renderScreen();

      await act(async () => {
        handler().setCode('await output("total", 9);');
        handler().setPorts({ outputs: [{ name: 'sum', type: 'int' }] });
        handler().setMeta({
          name: 'Renamed',
          description: 'Now it sums.',
          secrets: ['FAL_API_KEY'],
          timeoutSeconds: 15,
        });
        handler().setTests([{ name: 'one', inputs: { numbers: [1] } }]);
      });

      const state = mockStore.getState();
      expect(state.doc?.code).toBe('await output("total", 9);');
      expect(state.doc?.outputs).toEqual([{ name: 'sum', type: 'int' }]);
      // The port side the agent did not name is left alone.
      expect(state.doc?.inputs).toEqual([{ name: 'numbers', type: 'list[int]' }]);
      expect(state.name).toBe('Renamed');
      expect(state.doc?.description).toBe('Now it sums.');
      expect(state.doc?.secrets).toEqual(['FAL_API_KEY']);
      expect(state.doc?.timeoutSeconds).toBe(15);
      expect(state.doc?.tests).toEqual([{ name: 'one', inputs: { numbers: [1] } }]);
    });

    it('reports the issues its own edit introduced', async () => {
      renderScreen();

      let issues: string[] = [];
      await act(async () => {
        issues = handler()
          .setPorts({ inputs: [{ name: '2bad', type: 'str' }] })
          .issues.map((issue) => issue.code);
      });

      expect(issues).toContain('js_script_port_name');
    });

    it('saves before it runs, and remembers the outcome for the next snapshot', async () => {
      renderScreen();

      await act(async () => {
        await handler().run({ numbers: [1, 2] });
      });

      expect(saveMock).toHaveBeenCalled();
      expect(mockRunJsScript).toHaveBeenCalledWith(
        'js-1',
        { numbers: [1, 2] },
        undefined
      );
      expect(handler().getSnapshot().lastRun?.ok).toBe(true);
    });

    it('refuses to test a script with no saved cases', async () => {
      mockStore = makeStore({ doc: makeDocument({ tests: [] }) });
      renderScreen();

      await expect(handler().test()).rejects.toThrow(/no saved test cases/);
      expect(mockRunJsScript).not.toHaveBeenCalled();
    });

    it('turns a rejected save into a throw the agent can report', async () => {
      mockStore = makeStore({ dirty: true });
      saveMock.mockImplementationOnce(async () => {
        mockStore.setState({ status: 'conflict', error: 'modified since' });
      });
      renderScreen();

      await expect(handler().save()).rejects.toThrow('modified since');
    });
  });
});
