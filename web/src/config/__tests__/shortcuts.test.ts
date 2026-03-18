import React from "react";
import {
  NODE_EDITOR_SHORTCUTS,
  Shortcut,
  expandShortcutsForOS,
  getShortcutTooltip,
  SHORTCUT_CATEGORIES
} from "../shortcuts";

// Ensure React.createElement is available for getShortcutTooltip
jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return { ...actual, default: actual, __esModule: true };
});

describe("expandShortcutsForOS", () => {
  const sampleShortcuts: Shortcut[] = [
    {
      title: "Copy",
      slug: "copy",
      keyCombo: ["Control", "C"],
      category: "editor"
    },
    {
      title: "Option Test",
      slug: "optionTest",
      keyCombo: ["Alt", "X"],
      category: "editor"
    },
    {
      title: "Custom Mac",
      slug: "customMac",
      keyCombo: ["Control", "S"],
      keyComboMac: ["Meta", "S"],
      category: "editor"
    }
  ];

  it("should map Control to Meta on mac", () => {
    const result = expandShortcutsForOS(sampleShortcuts, true);
    const copy = result.find((s) => s.slug === "copy");
    expect(copy?.keyCombo).toEqual(["Meta", "C"]);
  });

  it("should map Alt to Option on mac", () => {
    const result = expandShortcutsForOS(sampleShortcuts, true);
    const opt = result.find((s) => s.slug === "optionTest");
    expect(opt?.keyCombo).toEqual(["Option", "X"]);
  });

  it("should use keyComboMac when provided on mac", () => {
    const result = expandShortcutsForOS(sampleShortcuts, true);
    const custom = result.find((s) => s.slug === "customMac");
    expect(custom?.keyCombo).toEqual(["Meta", "S"]);
  });

  it("should keep original combos on non-mac", () => {
    const result = expandShortcutsForOS(sampleShortcuts, false);
    const copy = result.find((s) => s.slug === "copy");
    expect(copy?.keyCombo).toEqual(["Control", "C"]);
  });

  it("should not mutate original shortcuts", () => {
    const original = sampleShortcuts.map((s) => ({ ...s, keyCombo: [...s.keyCombo] }));
    expandShortcutsForOS(sampleShortcuts, true);
    sampleShortcuts.forEach((s, i) => {
      expect(s.keyCombo).toEqual(original[i].keyCombo);
    });
  });
});

describe("getShortcutTooltip", () => {
  it("should return the slug if shortcut is not found", () => {
    const result = getShortcutTooltip("nonExistentSlug");
    expect(result).toBe("nonExistentSlug");
  });

  it("should return a React element for a valid shortcut", () => {
    const result = getShortcutTooltip("copy", "win");
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("props");
  });

  it("should return combo-only mode element", () => {
    const result = getShortcutTooltip("copy", "win", "combo");
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.props.className).toBe("shortcut-combo");
    }
  });
});

describe("SHORTCUT_CATEGORIES", () => {
  it("should have all expected categories", () => {
    expect(SHORTCUT_CATEGORIES).toHaveProperty("workflow");
    expect(SHORTCUT_CATEGORIES).toHaveProperty("panel");
    expect(SHORTCUT_CATEGORIES).toHaveProperty("editor");
    expect(SHORTCUT_CATEGORIES).toHaveProperty("assets");
  });

  it("all values should be non-empty strings", () => {
    Object.values(SHORTCUT_CATEGORIES).forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  });
});

describe("NODE_EDITOR_SHORTCUTS", () => {
  describe("resetZoom shortcut", () => {
    const resetZoomShortcut = NODE_EDITOR_SHORTCUTS.find(
      (s: Shortcut) => s.slug === "resetZoom"
    );

    it("should exist", () => {
      expect(resetZoomShortcut).toBeDefined();
    });

    it("should have correct keyCombo for non-Mac", () => {
      expect(resetZoomShortcut?.keyCombo).toEqual(["Control", "0"]);
    });

    it("should have correct category", () => {
      expect(resetZoomShortcut?.category).toBe("editor");
    });

    it("should be registerable", () => {
      expect(resetZoomShortcut?.registerCombo).toBe(true);
    });

    it("should have a description", () => {
      expect(resetZoomShortcut?.description).toBeDefined();
      expect(resetZoomShortcut?.description?.length).toBeGreaterThan(0);
    });

    it("should have title", () => {
      expect(resetZoomShortcut?.title).toBe("Reset Zoom");
    });
  });

  describe("shortcut count", () => {
    it("should have expected number of editor shortcuts", () => {
      const editorShortcuts = NODE_EDITOR_SHORTCUTS.filter(
        (s: Shortcut) => s.category === "editor"
      );
      expect(editorShortcuts.length).toBeGreaterThan(20);
    });

    it("should have resetZoom in the list", () => {
      const slugs = NODE_EDITOR_SHORTCUTS.map((s: Shortcut) => s.slug);
      expect(slugs).toContain("resetZoom");
    });

    it("should have unique slugs", () => {
      const slugs = NODE_EDITOR_SHORTCUTS.map((s: Shortcut) => s.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });

  describe("shortcut structure", () => {
    it("all shortcuts should have required properties", () => {
      NODE_EDITOR_SHORTCUTS.forEach((shortcut: Shortcut) => {
        expect(shortcut.slug).toBeDefined();
        expect(shortcut.slug.length).toBeGreaterThan(0);
        expect(shortcut.title).toBeDefined();
        expect(shortcut.title.length).toBeGreaterThan(0);
        expect(shortcut.keyCombo).toBeDefined();
        expect(shortcut.keyCombo.length).toBeGreaterThan(0);
        expect(shortcut.category).toBeDefined();
      });
    });

    it("all shortcuts should have valid key combos", () => {
      NODE_EDITOR_SHORTCUTS.forEach((shortcut: Shortcut) => {
        shortcut.keyCombo.forEach((key) => {
          expect(key.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("skipInElectron", () => {
    it("clipboard shortcuts (copy, cut, paste) should have skipInElectron set", () => {
      const clipboardSlugs = ["copy", "cut", "paste"];
      clipboardSlugs.forEach((slug) => {
        const shortcut = NODE_EDITOR_SHORTCUTS.find(
          (s: Shortcut) => s.slug === slug
        );
        expect(shortcut).toBeDefined();
        expect(shortcut?.skipInElectron).toBe(true);
      });
    });
  });
});
