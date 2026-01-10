import { renderHook, act } from "@testing-library/react";
import { Shortcut } from "../../config/shortcuts";
import { useShortcutSettingsStore } from "../ShortcutSettingsStore";

const createMockShortcut = (overrides: Partial<Shortcut> = {}): Shortcut => ({
  title: "Test Shortcut",
  slug: "testShortcut",
  keyCombo: ["Control", "T"],
  category: "editor",
  keyComboMac: ["Meta", "T"],
  description: "A test shortcut",
  registerCombo: true,
  ...overrides
});

describe("ShortcutSettingsStore", () => {
  beforeEach(() => {
    act(() => {
      useShortcutSettingsStore.setState({ customShortcuts: {} });
    });
  });

  describe("setCustomShortcut", () => {
    it("should set a custom shortcut", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("testShortcut", ["Control", "A"], ["Meta", "A"]);
      });

      const customShortcuts = result.current.customShortcuts;
      expect(customShortcuts["testShortcut"]).toEqual({
        slug: "testShortcut",
        keyCombo: ["Control", "A"],
        keyComboMac: ["Meta", "A"]
      });
    });

    it("should override existing shortcut", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("testShortcut", ["Control", "A"]);
      });

      act(() => {
        result.current.setCustomShortcut("testShortcut", ["Control", "B"]);
      });

      expect(result.current.customShortcuts["testShortcut"].keyCombo).toEqual(["Control", "B"]);
    });
  });

  describe("removeCustomShortcut", () => {
    it("should remove a custom shortcut", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("testShortcut", ["Control", "A"]);
      });

      expect(result.current.customShortcuts["testShortcut"]).toBeDefined();

      act(() => {
        result.current.removeCustomShortcut("testShortcut");
      });

      expect(result.current.customShortcuts["testShortcut"]).toBeUndefined();
    });
  });

  describe("resetAllShortcuts", () => {
    it("should reset all shortcuts", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
        result.current.setCustomShortcut("shortcut2", ["Control", "B"]);
      });

      expect(Object.keys(result.current.customShortcuts).length).toBe(2);

      act(() => {
        result.current.resetAllShortcuts();
      });

      expect(Object.keys(result.current.customShortcuts).length).toBe(0);
    });
  });

  describe("getEffectiveShortcut", () => {
    it("should return custom shortcut when set", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());
      const shortcut = createMockShortcut();

      act(() => {
        result.current.setCustomShortcut(shortcut.slug, ["Control", "X"], ["Meta", "X"]);
      });

      const effective = result.current.getEffectiveShortcut(shortcut);
      expect(effective).toEqual({
        slug: shortcut.slug,
        keyCombo: ["Control", "X"],
        keyComboMac: ["Meta", "X"]
      });
    });

    it("should return null when no custom shortcut is set", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());
      const shortcut = createMockShortcut();

      const effective = result.current.getEffectiveShortcut(shortcut);
      expect(effective).toBeNull();
    });
  });

  describe("getAllEffectiveShortcuts", () => {
    it("should return all custom shortcuts", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
        result.current.setCustomShortcut("shortcut2", ["Control", "B"]);
      });

      const allShortcuts = result.current.getAllEffectiveShortcuts();
      expect(allShortcuts).toEqual({
        shortcut1: { slug: "shortcut1", keyCombo: ["Control", "A"] },
        shortcut2: { slug: "shortcut2", keyCombo: ["Control", "B"] }
      });
    });
  });

  describe("isConflicting", () => {
    it("should detect conflict with existing custom shortcut", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
      });

      const isConflicting = result.current.isConflicting("shortcut2", ["Control", "A"]);
      expect(isConflicting).toBe(true);
    });

    it("should not detect conflict with same slug", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
      });

      const isConflicting = result.current.isConflicting("shortcut1", ["Control", "A"], "shortcut1");
      expect(isConflicting).toBe(false);
    });

    it("should not detect conflict with different combo", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
      });

      const isConflicting = result.current.isConflicting("shortcut2", ["Control", "B"]);
      expect(isConflicting).toBe(false);
    });
  });

  describe("getConflicts", () => {
    it("should return conflicting shortcuts", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
        result.current.setCustomShortcut("shortcut2", ["Control", "B"]);
      });

      const conflicts = result.current.getConflicts("shortcut3", ["Control", "A"]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].slug).toBe("shortcut1");
    });

    it("should return empty array when no conflicts", () => {
      const { result } = renderHook(() => useShortcutSettingsStore());

      act(() => {
        result.current.setCustomShortcut("shortcut1", ["Control", "A"]);
      });

      const conflicts = result.current.getConflicts("shortcut2", ["Control", "B"]);
      expect(conflicts).toHaveLength(0);
    });
  });
});
