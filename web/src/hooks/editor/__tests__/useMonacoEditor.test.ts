import { renderHook, act } from "@testing-library/react";

const mockRegisterCommand = jest.fn();
const mockAddKeybindingRule = jest.fn();

// Jest maps both `monaco-editor` and `@monaco-editor/react` to one empty
// module, so a mock of either replaces both. This one serves as each.
jest.mock("../../../__mocks__/emptyModule", () => ({
  __esModule: true,
  default: () => null,
  KeyCode: { KeyK: 41 },
  KeyMod: { CtrlCmd: 2048 },
  editor: {
    registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
    addKeybindingRule: (...args: unknown[]) => mockAddKeybindingRule(...args)
  }
}));

jest.mock("@monaco-editor/loader", () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    init: jest.fn().mockResolvedValue({})
  }
}));

import { useMonacoEditor } from "../useMonacoEditor";
import { useCommandMenuStore } from "../../../stores/CommandMenuStore";

describe("useMonacoEditor", () => {
  test("lazy loads Monaco editor once and exposes handlers", async () => {
    const { result } = renderHook(() => useMonacoEditor());

    expect(result.current.MonacoEditor).toBeNull();
    expect(result.current.monacoLoadError).toBeNull();
    expect(result.current.isMonacoLoading).toBe(false);

    await act(async () => {
      await result.current.loadMonacoIfNeeded();
    });

    expect(result.current.MonacoEditor).not.toBeNull();
    expect(result.current.isMonacoLoading).toBe(false);

    // handlers should be callable without throwing
    expect(() => result.current.handleMonacoFind()).not.toThrow();
    expect(() => result.current.handleMonacoFormat()).not.toThrow();
  });

  test("does not reload if already loaded", async () => {
    const { result } = renderHook(() => useMonacoEditor());
    await act(async () => {
      await result.current.loadMonacoIfNeeded();
    });
    const first = result.current.MonacoEditor;
    await act(async () => {
      await result.current.loadMonacoIfNeeded();
    });
    expect(result.current.MonacoEditor).toBe(first);
  });

  // Monaco consumes Cmd/Ctrl+K for its own chords, so the app's dispatcher
  // never sees the key while an editor has focus.
  test("binds Cmd/Ctrl+K in every editor to the command menu", async () => {
    const { result } = renderHook(() => useMonacoEditor());
    await act(async () => {
      await result.current.loadMonacoIfNeeded();
    });
    expect(mockAddKeybindingRule).toHaveBeenCalledWith({
      keybinding: 2048 | 41,
      command: "nodetool.toggleCommandMenu"
    });
    const [id, handler] = mockRegisterCommand.mock.calls[0] as [string, () => void];
    expect(id).toBe("nodetool.toggleCommandMenu");
    useCommandMenuStore.setState({ open: false });
    handler();
    expect(useCommandMenuStore.getState().open).toBe(true);
  });
});





