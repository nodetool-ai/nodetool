import { renderHook, act } from "@testing-library/react";
import { useCustomShortcutsStore } from "../CustomShortcutsStore";

describe("CustomShortcutsStore", () => {
  beforeEach(() => {
    act(() => {
      useCustomShortcutsStore.setState({ customShortcuts: {} });
    });
  });

  describe("setCustomShortcut", () => {
    it("should set a custom shortcut for a slug", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
      });

      const customShortcuts = useCustomShortcutsStore.getState().customShortcuts;
      expect(customShortcuts.copy).toEqual({
        slug: "copy",
        customCombo: ["control", "c"],
        useCustom: true
      });
    });

    it("should overwrite existing custom shortcut", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["meta", "c"]);
      });

      const customShortcuts = useCustomShortcutsStore.getState().customShortcuts;
      expect(customShortcuts.copy.customCombo).toEqual(["meta", "c"]);
    });
  });

  describe("removeCustomShortcut", () => {
    it("should remove a custom shortcut", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
        useCustomShortcutsStore.getState().removeCustomShortcut("copy");
      });

      const customShortcuts = useCustomShortcutsStore.getState().customShortcuts;
      expect(customShortcuts.copy).toBeUndefined();
    });
  });

  describe("resetAllShortcuts", () => {
    it("should remove all custom shortcuts", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
        useCustomShortcutsStore.getState().setCustomShortcut("paste", ["control", "v"]);
        useCustomShortcutsStore.getState().resetAllShortcuts();
      });

      const customShortcuts = useCustomShortcutsStore.getState().customShortcuts;
      expect(Object.keys(customShortcuts)).toHaveLength(0);
    });
  });

  describe("getEffectiveCombo", () => {
    it("should return custom combo when set", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["meta", "c"]);
      });

      const effectiveCombo = useCustomShortcutsStore.getState().getEffectiveCombo(
        "copy",
        ["control", "c"]
      );
      expect(effectiveCombo).toEqual(["meta", "c"]);
    });

    it("should return default combo when no custom shortcut is set", () => {
      const effectiveCombo = useCustomShortcutsStore.getState().getEffectiveCombo(
        "copy",
        ["control", "c"]
      );
      expect(effectiveCombo).toEqual(["control", "c"]);
    });

    it("should return default combo when custom shortcut useCustom is false", () => {
      act(() => {
        useCustomShortcutsStore.setState({
          customShortcuts: {
            copy: { slug: "copy", customCombo: ["meta", "c"], useCustom: false }
          }
        });
      });

      const effectiveCombo = useCustomShortcutsStore.getState().getEffectiveCombo(
        "copy",
        ["control", "c"]
      );
      expect(effectiveCombo).toEqual(["control", "c"]);
    });
  });

  describe("isShortcutInUse", () => {
    it("should return true when combo is in use by another shortcut", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
      });

      const isInUse = useCustomShortcutsStore.getState().isShortcutInUse(["control", "c"]);
      expect(isInUse).toBe(true);
    });

    it("should return false when combo is not in use", () => {
      const isInUse = useCustomShortcutsStore.getState().isShortcutInUse(["control", "c"]);
      expect(isInUse).toBe(false);
    });

    it("should return false when checking own shortcut", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
      });

      const isInUse = useCustomShortcutsStore.getState().isShortcutInUse(["control", "c"], "copy");
      expect(isInUse).toBe(false);
    });

    it("should be case insensitive", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["CONTROL", "C"]);
      });

      const isInUse = useCustomShortcutsStore.getState().isShortcutInUse(["control", "c"]);
      expect(isInUse).toBe(true);
    });
  });

  describe("getConflicts", () => {
    it("should return list of conflicting slugs", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
        useCustomShortcutsStore.getState().setCustomShortcut("customAction", ["control", "c"]);
      });

      const conflicts = useCustomShortcutsStore.getState().getConflicts(["control", "c"]);
      expect(conflicts).toContain("copy");
      expect(conflicts).toContain("customAction");
    });

    it("should exclude specified slug from conflicts", () => {
      act(() => {
        useCustomShortcutsStore.getState().setCustomShortcut("copy", ["control", "c"]);
        useCustomShortcutsStore.getState().setCustomShortcut("customAction", ["control", "c"]);
      });

      const conflicts = useCustomShortcutsStore.getState().getConflicts(["control", "c"], "copy");
      expect(conflicts).not.toContain("copy");
      expect(conflicts).toContain("customAction");
    });
  });
});

describe("Helper functions", () => {
  describe("formatComboForDisplay", () => {
    it("should format control key", () => {
      const { formatComboForDisplay } = require("../CustomShortcutsStore");
      const result = formatComboForDisplay(["control", "c"]);
      expect(result).toBe("Ctrl + C");
    });

    it("should format meta key", () => {
      const { formatComboForDisplay } = require("../CustomShortcutsStore");
      const result = formatComboForDisplay(["meta", "c"]);
      expect(result).toBe("⌘ + C");
    });

    it("should format arrow keys", () => {
      const { formatComboForDisplay } = require("../CustomShortcutsStore");
      const result = formatComboForDisplay(["arrowup"]);
      expect(result).toBe("↑");
    });

    it("should format space key", () => {
      const { formatComboForDisplay } = require("../CustomShortcutsStore");
      const result = formatComboForDisplay([" "]);
      expect(result).toBe("Space");
    });
  });

  describe("isValidKey", () => {
    it("should return true for valid keys", () => {
      const { isValidKey } = require("../CustomShortcutsStore");
      expect(isValidKey("a")).toBe(true);
      expect(isValidKey("control")).toBe(true);
      expect(isValidKey("enter")).toBe(true);
      expect(isValidKey("arrowup")).toBe(true);
      expect(isValidKey("f1")).toBe(true);
    });

    it("should return false for invalid keys", () => {
      const { isValidKey } = require("../CustomShortcutsStore");
      expect(isValidKey("invalid")).toBe(false);
      expect(isValidKey("unknownkey")).toBe(false);
    });
  });
});
