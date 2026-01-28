import { renderHook, act } from "@testing-library/react";

// Mock Monaco at module level before any imports
jest.mock("monaco-editor", () => ({
  EditorAction: class {},
  Emitter: class {
    emit() {}
    on() {}
  },
  KeyCode: {},
  KeyMod: {},
  MarkerSeverity: {},
  MarkerTag: {},
  Position: class {},
  Range: class {},
  Selection: class {},
  Severity: {},
  ViewZone: class {},
  Uri: {
    file() { return { path: "", toString: () => "" }; },
    parse() { return { path: "", toString: () => "" }; }
  },
  languages: {
    register() {},
    setLanguageConfiguration() {},
    registerCompletionItemProvider() {}
  },
  tokenize() { return []; }
}));

jest.mock("@monaco-editor/loader", () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    init: jest.fn().mockResolvedValue({})
  }
}));

jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: () => null
}));

import { useMonacoEditor } from "../useMonacoEditor";

describe("useMonacoEditor", () => {
  test("lazy loads Monaco editor once and exposes handlers", async () => {
    const { result } = renderHook(() => useMonacoEditor());

    expect(result.current.MonacoEditor).toBeNull();
    expect(result.current.monacoLoadError).toBeNull();

    await act(async () => {
      await result.current.loadMonacoIfNeeded();
    });

    expect(result.current.MonacoEditor).not.toBeNull();

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
});





