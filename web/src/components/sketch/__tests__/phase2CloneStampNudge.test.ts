/**
 * Phase 2 — Clone stamp tool, arrow-key nudge, shape-from-center, and new keyboard shortcuts.
 */

import { useSketchStore } from "../state/useSketchStore";
import {
  DEFAULT_CLONE_STAMP_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  CloneStampSettings,
  createDefaultDocument,
  normalizeSketchDocument,
  isPaintingTool,
  SketchTool
} from "../types";

// ─── Helpers ───────────────────────────────────────────────────────────────
function resetStore() {
  useSketchStore.setState({
    document: createDefaultDocument(),
    activeTool: "brush",
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDrawing: false,
    history: [],
    historyIndex: -1,
    foregroundColor: "#ffffff",
    backgroundColor: "#000000",
    colorMode: "hex",
    selection: null,
    isolatedLayerId: null,
    panelsHidden: false
  });
}

beforeEach(() => {
  resetStore();
});

// ─── Clone Stamp Tool Type ────────────────────────────────────────────
describe("Clone stamp tool type", () => {
  it("should include clone_stamp in SketchTool type", () => {
    const tool: SketchTool = "clone_stamp";
    expect(tool).toBe("clone_stamp");
  });

  it("should be classified as a painting tool", () => {
    expect(isPaintingTool("clone_stamp")).toBe(true);
  });

  it("should not be classified as a painting tool for non-painting tools", () => {
    expect(isPaintingTool("move")).toBe(false);
    expect(isPaintingTool("crop")).toBe(false);
    expect(isPaintingTool("select")).toBe(false);
  });
});

// ─── Clone Stamp Default Settings ─────────────────────────────────────
describe("Clone stamp default settings", () => {
  it("should have correct default values", () => {
    expect(DEFAULT_CLONE_STAMP_SETTINGS).toEqual({
      size: 20,
      opacity: 1,
      hardness: 0.8,
      sampling: "active_layer"
    });
  });

  it("should be included in DEFAULT_TOOL_SETTINGS", () => {
    expect(DEFAULT_TOOL_SETTINGS.cloneStamp).toBeDefined();
    expect(DEFAULT_TOOL_SETTINGS.cloneStamp).toEqual(DEFAULT_CLONE_STAMP_SETTINGS);
  });

  it("should be included in createDefaultDocument", () => {
    const doc = createDefaultDocument();
    expect(doc.toolSettings.cloneStamp).toBeDefined();
    expect(doc.toolSettings.cloneStamp).toEqual(DEFAULT_CLONE_STAMP_SETTINGS);
  });
});

// ─── Clone Stamp Store Actions ────────────────────────────────────────
describe("Clone stamp store actions", () => {
  it("should set clone stamp settings", () => {
    const store = useSketchStore.getState();
    store.setCloneStampSettings({ size: 40 });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.size).toBe(40);
    // Other settings should be preserved
    expect(updated.document.toolSettings.cloneStamp.opacity).toBe(1);
    expect(updated.document.toolSettings.cloneStamp.hardness).toBe(0.8);
    expect(updated.document.toolSettings.cloneStamp.sampling).toBe("active_layer");
  });

  it("should update opacity independently", () => {
    const store = useSketchStore.getState();
    store.setCloneStampSettings({ opacity: 0.5 });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.opacity).toBe(0.5);
    expect(updated.document.toolSettings.cloneStamp.size).toBe(20);
  });

  it("should update hardness independently", () => {
    const store = useSketchStore.getState();
    store.setCloneStampSettings({ hardness: 0.3 });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.hardness).toBe(0.3);
  });

  it("should change sampling mode", () => {
    const store = useSketchStore.getState();
    store.setCloneStampSettings({ sampling: "composited" });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.sampling).toBe("composited");
  });

  it("should set clone_stamp as active tool", () => {
    const store = useSketchStore.getState();
    store.setActiveTool("clone_stamp");
    const updated = useSketchStore.getState();
    expect(updated.activeTool).toBe("clone_stamp");
  });

  it("should update metadata timestamp when changing clone stamp settings", () => {
    useSketchStore.getState().setCloneStampSettings({ size: 50 });
    const after = useSketchStore.getState().document.metadata.updatedAt;
    // The updatedAt should be a valid ISO date string
    expect(typeof after).toBe("string");
    expect(after.length).toBeGreaterThan(0);
    expect(new Date(after).toISOString()).toBe(after);
  });
});

// ─── normalizeSketchDocument with cloneStamp ──────────────────────────
describe("normalizeSketchDocument with clone stamp", () => {
  it("should fill missing cloneStamp with defaults", () => {
    const doc = createDefaultDocument();
    // Simulate older document without cloneStamp
    const partial = {
      ...doc,
      toolSettings: {
        brush: doc.toolSettings.brush,
        pencil: doc.toolSettings.pencil,
        eraser: doc.toolSettings.eraser,
        shape: doc.toolSettings.shape,
        fill: doc.toolSettings.fill,
        blur: doc.toolSettings.blur,
        gradient: doc.toolSettings.gradient
      }
    } as ReturnType<typeof createDefaultDocument>;
    const normalized = normalizeSketchDocument(partial);
    expect(normalized.toolSettings.cloneStamp).toEqual(DEFAULT_CLONE_STAMP_SETTINGS);
  });

  it("should preserve existing cloneStamp settings when normalizing", () => {
    const doc = createDefaultDocument();
    doc.toolSettings.cloneStamp = {
      size: 50,
      opacity: 0.7,
      hardness: 0.5,
      sampling: "composited"
    };
    const normalized = normalizeSketchDocument(doc);
    expect(normalized.toolSettings.cloneStamp.size).toBe(50);
    expect(normalized.toolSettings.cloneStamp.opacity).toBe(0.7);
    expect(normalized.toolSettings.cloneStamp.sampling).toBe("composited");
  });
});

// ─── Select All / Deselect ────────────────────────────────────────────
describe("Select all and deselect", () => {
  it("selectAll should set selection to full canvas", () => {
    const store = useSketchStore.getState();
    store.selectAll();
    const sel = useSketchStore.getState().selection;
    expect(sel).not.toBeNull();
    expect(sel!.x).toBe(0);
    expect(sel!.y).toBe(0);
    expect(sel!.width).toBe(512);
    expect(sel!.height).toBe(512);
  });

  it("setSelection(null) should deselect", () => {
    const store = useSketchStore.getState();
    store.selectAll();
    expect(useSketchStore.getState().selection).not.toBeNull();
    store.setSelection(null);
    expect(useSketchStore.getState().selection).toBeNull();
  });
});

// ─── Bracket keys affect clone stamp ──────────────────────────────────
describe("Bracket keys and clone stamp size", () => {
  it("should allow incrementing clone stamp size", () => {
    const store = useSketchStore.getState();
    store.setActiveTool("clone_stamp");
    const initialSize = store.document.toolSettings.cloneStamp.size;
    store.setCloneStampSettings({ size: initialSize + 5 });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.size).toBe(initialSize + 5);
  });

  it("should allow decrementing clone stamp size", () => {
    const store = useSketchStore.getState();
    store.setActiveTool("clone_stamp");
    const initialSize = store.document.toolSettings.cloneStamp.size;
    store.setCloneStampSettings({ size: Math.max(1, initialSize - 5) });
    const updated = useSketchStore.getState();
    expect(updated.document.toolSettings.cloneStamp.size).toBe(Math.max(1, initialSize - 5));
  });
});

// ─── Zoom to 100% ─────────────────────────────────────────────────────
describe("Zoom to 100%", () => {
  it("should set zoom to exactly 1.0 for 100% view", () => {
    const store = useSketchStore.getState();
    store.setZoom(2.5);
    expect(useSketchStore.getState().zoom).toBe(2.5);
    store.setZoom(1);
    expect(useSketchStore.getState().zoom).toBe(1);
  });
});
