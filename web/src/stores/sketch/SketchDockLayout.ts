import { createDockLayoutModel, type DockLayout } from "../dock/DockLayout";

/** Every panel the sketch editor can dock. `canvas` is required. */
export const SKETCH_PANEL_IDS = [
  "canvas", "color", "layers", "history", "properties", "canvasSize", "assistant"
] as const;
export type SketchPanelId = typeof SKETCH_PANEL_IDS[number];

/** Built-in layouts in menu order. The first is the default. */
export const SKETCH_LAYOUT_PRESETS = ["Essentials", "Painting", "Compositing", "Assistant"] as const;
export type SketchLayoutPreset = typeof SKETCH_LAYOUT_PRESETS[number];

/** Width, in px, of the right column in the default layout. Matches the column the editor had before the dock. */
const RIGHT_WIDTH = 260;

function createPreset(name: string): DockLayout {
  // The assistant has the left column to itself, so a chat gets the full height beside the canvas.
  const layout: DockLayout = {
    version: 1,
    regions: {
      left: [{ id: "left-assistant", panels: ["assistant"], activePanelId: "assistant" }],
      right: [
        { id: "right-color", panels: ["color"], activePanelId: "color", weight: 0.9 },
        { id: "right-layers", panels: ["layers", "history"], activePanelId: "layers", weight: 1.5 },
        { id: "right-detail", panels: ["properties", "canvasSize"], activePanelId: "properties", weight: 0.8 }
      ],
      bottom: [],
      viewport: [{ id: "viewport-canvas", panels: ["canvas"], activePanelId: "canvas" }]
    },
    hidden: ["assistant"],
    sizes: { left: 360, right: RIGHT_WIDTH, bottom: 200 }
  };
  if (name === "Painting") {
    // The color picker with room for its swatches and the stroke history in view, with the layer settings a tab away.
    layout.regions.right = [
      { id: "right-color", panels: ["color"], activePanelId: "color", weight: 1 },
      { id: "right-layers", panels: ["layers"], activePanelId: "layers", weight: 1.4 },
      { id: "right-detail", panels: ["history", "properties", "canvasSize"], activePanelId: "history", weight: 0.8 }
    ];
    layout.sizes = { ...layout.sizes, right: 300 };
  }
  if (name === "Compositing") {
    // Layers and their properties take the column. Color and history share a tab group.
    layout.regions.right = [
      { id: "right-layers", panels: ["layers"], activePanelId: "layers", weight: 1.6 },
      { id: "right-detail", panels: ["properties", "canvasSize"], activePanelId: "properties", weight: 1 },
      { id: "right-color", panels: ["color", "history"], activePanelId: "color", weight: 1 }
    ];
    layout.sizes = { ...layout.sizes, right: 340 };
  }
  if (name === "Assistant") {
    layout.hidden = [];
    layout.sizes = { ...layout.sizes, left: 420 };
  }
  return layout;
}

/**
 * The sketch editor's dock. The canvas is required, the panels start in a
 * right column, and layouts persist under `nodetool.sketch-layout.v1`.
 */
export const sketchDockLayoutModel = createDockLayoutModel({
  editorLabel: "sketch",
  persistKeyPrefix: "nodetool.sketch-layout.v1",
  requiredPanels: ["canvas"],
  presets: SKETCH_LAYOUT_PRESETS,
  createPreset
});
