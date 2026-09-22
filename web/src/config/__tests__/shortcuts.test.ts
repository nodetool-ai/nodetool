import { NODE_EDITOR_SHORTCUTS, Shortcut } from "../shortcuts";

describe("NODE_EDITOR_SHORTCUTS", () => {
  describe("resetZoom shortcut", () => {
    const resetZoomShortcut = NODE_EDITOR_SHORTCUTS.find(
      (s: Shortcut) => s.slug === "resetZoom"
    );

    it("should have correct keyCombo for non-Mac", () => {
      expect(resetZoomShortcut?.keyCombo).toEqual(["Control", "0"]);
    });

    it("should have correct category", () => {
      expect(resetZoomShortcut?.category).toBe("editor");
    });

    it("should be registerable", () => {
      expect(resetZoomShortcut?.registerCombo).toBe(true);
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

    it("does not advertise simultaneous multi-digit zoom chords", () => {
      expect(
        NODE_EDITOR_SHORTCUTS.find((shortcut) => shortcut.slug === "zoom50")
          ?.keyCombo
      ).toEqual(["Control", "Alt", "5"]);
      expect(
        NODE_EDITOR_SHORTCUTS.find((shortcut) => shortcut.slug === "zoom100")
          ?.keyCombo
      ).toEqual(["Control", "Alt", "1"]);
      expect(
        NODE_EDITOR_SHORTCUTS.find((shortcut) => shortcut.slug === "zoom200")
          ?.keyCombo
      ).toEqual(["Control", "Alt", "2"]);
    });

    it("keeps directional focus and history on distinct bindings", () => {
      const focusLeft = NODE_EDITOR_SHORTCUTS.find(
        (shortcut) => shortcut.slug === "focusNodeLeft"
      );
      const goBack = NODE_EDITOR_SHORTCUTS.find(
        (shortcut) => shortcut.slug === "goBack"
      );
      expect(goBack?.keyCombo).not.toEqual(focusLeft?.keyCombo);
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
