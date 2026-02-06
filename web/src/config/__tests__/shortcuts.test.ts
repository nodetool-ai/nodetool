import { NODE_EDITOR_SHORTCUTS, Shortcut } from "../shortcuts";

describe("NODE_EDITOR_SHORTCUTS", () => {
  describe("addComment shortcut", () => {
    const addCommentShortcut = NODE_EDITOR_SHORTCUTS.find(
      (s: Shortcut) => s.slug === "addComment"
    );

    it("should exist", () => {
      expect(addCommentShortcut).toBeDefined();
    });

    it("should have correct keyCombo for non-Mac", () => {
      expect(addCommentShortcut?.keyCombo).toEqual(["Control", "/"]);
    });

    it("should have correct category", () => {
      expect(addCommentShortcut?.category).toBe("editor");
    });

    it("should be registerable", () => {
      expect(addCommentShortcut?.registerCombo).toBe(true);
    });

    it("should have a description", () => {
      expect(addCommentShortcut?.description).toBeDefined();
      expect(addCommentShortcut?.description?.length).toBeGreaterThan(0);
    });

    it("should have title", () => {
      expect(addCommentShortcut?.title).toBe("Add Comment");
    });
  });

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
});
