import { renderHook } from "@testing-library/react";
import { useEditorKeyboardShortcuts } from "../useEditorKeyboardShortcuts";

// We will mock useCombo to ensure combos are registered with expected callbacks
jest.mock("../../../stores/KeyPressedStore", () => {
  const actual = jest.requireActual("../../../stores/KeyPressedStore");
  return {
    ...actual,
    useCombo: jest.fn()
  };
});

import { useCombo } from "../../../stores/KeyPressedStore";

describe("useEditorKeyboardShortcuts", () => {
  test("registers all expected combos", () => {
    jest.mocked(useCombo).mockClear();
    const onToggleFullscreen = jest.fn();
    const onToggleAssistant = jest.fn();
    const onToggleEditorMode = jest.fn();

    renderHook(() =>
      useEditorKeyboardShortcuts({
        onToggleFullscreen,
        onToggleAssistant,
        onToggleEditorMode
      })
    );

    // Expect six registrations (ctrl/meta x f/a/e)
    expect(jest.mocked(useCombo).mock.calls.length).toBe(6);
    const calls = jest.mocked(useCombo).mock.calls;
    const combos = calls.map((c) => c[0].join("+").toLowerCase());
    expect(combos).toEqual(
      expect.arrayContaining([
        "control+shift+f",
        "meta+shift+f",
        "control+shift+a",
        "meta+shift+a",
        "control+shift+e",
        "meta+shift+e"
      ])
    );
  });
});





