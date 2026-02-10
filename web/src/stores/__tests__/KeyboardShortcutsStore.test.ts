/**
 * Tests for KeyboardShortcutsStore
 */

import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcutsStore } from "../KeyboardShortcutsStore";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";

describe("KeyboardShortcutsStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useKeyboardShortcutsStore.getState().resetToDefaults();
  });

  describe("initial state", () => {
    it("should have empty custom shortcuts initially", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      expect(result.current.customShortcuts).toEqual({});
    });

    it("should return default shortcuts when no customizations exist", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const allShortcuts = result.current.getAllShortcuts();
      expect(allShortcuts).toHaveLength(NODE_EDITOR_SHORTCUTS.length);
    });

    it("should return default combo for uncustomized shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const copyCombo = result.current.getShortcutCombo("copy");
      expect(copyCombo).toEqual(["Control", "C"]);
    });
  });

  describe("setCustomShortcut", () => {
    it("should set a custom shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      expect(result.current.customShortcuts).toEqual({
        copy: ["Control", "K"]
      });
    });

    it("should return custom combo when set", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      const copyCombo = result.current.getShortcutCombo("copy");
      expect(copyCombo).toEqual(["Control", "K"]);
    });

    it("should include custom shortcuts in getAllShortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      const allShortcuts = result.current.getAllShortcuts();
      const copyShortcut = allShortcuts.find((s) => s.slug === "copy");
      
      expect(copyShortcut?.keyCombo).toEqual(["Control", "K"]);
    });

    it("should update existing custom shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "L"]);
      });
      
      expect(result.current.customShortcuts).toEqual({
        copy: ["Control", "L"]
      });
    });
  });

  describe("removeCustomShortcut", () => {
    it("should remove a custom shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      act(() => {
        result.current.removeCustomShortcut("copy");
      });
      
      expect(result.current.customShortcuts).toEqual({});
    });

    it("should revert to default combo after removal", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      act(() => {
        result.current.removeCustomShortcut("copy");
      });
      
      const copyCombo = result.current.getShortcutCombo("copy");
      expect(copyCombo).toEqual(["Control", "C"]);
    });
  });

  describe("resetToDefaults", () => {
    it("should clear all custom shortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
        result.current.setCustomShortcut("paste", ["Control", "L"]);
      });
      
      act(() => {
        result.current.resetToDefaults();
      });
      
      expect(result.current.customShortcuts).toEqual({});
    });

    it("should revert all shortcuts to defaults after reset", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
        result.current.setCustomShortcut("paste", ["Control", "L"]);
      });
      
      act(() => {
        result.current.resetToDefaults();
      });
      
      expect(result.current.getShortcutCombo("copy")).toEqual(["Control", "C"]);
      expect(result.current.getShortcutCombo("paste")).toEqual(["Control", "V"]);
    });
  });

  describe("hasConflict", () => {
    it("should detect conflict with another shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "V"]);
      });
      
      const hasConflict = result.current.hasConflict("copy", ["Control", "V"]);
      expect(hasConflict).toBe(true);
    });

    it("should not detect conflict when using original combo", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const hasConflict = result.current.hasConflict("copy", ["Control", "C"]);
      expect(hasConflict).toBe(false);
    });

    it("should not detect conflict for unique combo", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const hasConflict = result.current.hasConflict("copy", ["Control", "K"]);
      expect(hasConflict).toBe(false);
    });

    it("should skip self when checking conflicts", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      const hasConflict = result.current.hasConflict("copy", ["Control", "K"]);
      expect(hasConflict).toBe(false);
    });

    it("should filter by category when provided", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      // "runWorkflow" is in "workflow" category, "copy" is in "editor" category
      const hasConflict = result.current.hasConflict(
        "copy",
        ["Control", "Enter"],
        "editor"
      );
      
      expect(hasConflict).toBe(false);
    });
  });

  describe("findShortcutByCombo", () => {
    it("should find shortcut by default combo", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const shortcut = result.current.findShortcutByCombo(["Control", "C"]);
      
      expect(shortcut).toBeDefined();
      expect(shortcut?.slug).toBe("copy");
    });

    it("should find shortcut by custom combo", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      const shortcut = result.current.findShortcutByCombo(["Control", "K"]);
      
      expect(shortcut).toBeDefined();
      expect(shortcut?.slug).toBe("copy");
    });

    it("should return undefined for unknown combo", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const shortcut = result.current.findShortcutByCombo(["Control", "Z", "X", "Y"]);
      
      expect(shortcut).toBeUndefined();
    });
  });

  describe("combo normalization", () => {
    it("should handle different key order consistently", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      // These should be considered the same combo
      const shortcut1 = result.current.findShortcutByCombo(["control", "c"]);
      const shortcut2 = result.current.findShortcutByCombo(["c", "control"]);
      
      expect(shortcut1?.slug).toBe(shortcut2?.slug);
    });

    it("should be case insensitive", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const shortcut1 = result.current.findShortcutByCombo(["Control", "C"]);
      const shortcut2 = result.current.findShortcutByCombo(["control", "c"]);
      
      expect(shortcut1?.slug).toBe(shortcut2?.slug);
    });
  });

  describe("getShortcutCombo", () => {
    it("should return custom combo when set", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      const combo = result.current.getShortcutCombo("copy");
      expect(combo).toEqual(["Control", "K"]);
    });

    it("should return default combo for unknown slug", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      const combo = result.current.getShortcutCombo("unknown-shortcut");
      expect(combo).toEqual([]);
    });

    it("should return default combo when custom is removed", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());
      
      act(() => {
        result.current.setCustomShortcut("copy", ["Control", "K"]);
      });
      
      act(() => {
        result.current.removeCustomShortcut("copy");
      });
      
      const combo = result.current.getShortcutCombo("copy");
      expect(combo).toEqual(["Control", "C"]);
    });
  });
});
