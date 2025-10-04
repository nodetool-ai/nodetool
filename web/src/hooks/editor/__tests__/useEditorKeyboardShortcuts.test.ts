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
    (useCombo as jest.Mock).mockClear();
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
    expect((useCombo as jest.Mock).mock.calls.length).toBe(6);
    const calls = (useCombo as jest.Mock).mock.calls;
    const combos = calls.map((c: any[]) => c[0].join("+"));
    expect(combos).toEqual(
      expect.arrayContaining([
        "ctrl+shift+f",
        "meta+shift+f",
        "ctrl+shift+a",
        "meta+shift+a",
        "ctrl+shift+e",
        "meta+shift+e"
      ])
    );
  });
});






