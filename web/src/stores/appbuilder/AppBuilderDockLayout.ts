import { createDockLayoutModel, type DockLayout } from "../dock/DockLayout";

/** Every panel the app builder can dock. The canvas is required. */
export const APP_BUILDER_PANEL_IDS = ["canvas", "components", "outline", "fields", "data", "assistant"] as const;
export type AppBuilderPanelId = typeof APP_BUILDER_PANEL_IDS[number];

/** Built-in layouts in menu order. The first is the default. */
export const APP_BUILDER_LAYOUTS = ["Default", "Canvas"] as const;

function createPreset(name: string): DockLayout {
  const layout: DockLayout = {
    version: 1,
    regions: {
      left: [{ id: "left-main", panels: ["components", "outline"], activePanelId: "components" }],
      // The agent sits under Properties, taking more of the height for its thread.
      right: [
        { id: "right-main", panels: ["fields", "data"], activePanelId: "fields" },
        { id: "right-assistant", panels: ["assistant"], activePanelId: "assistant", weight: 1.5 }
      ],
      bottom: [],
      viewport: [{ id: "viewport-main", panels: ["canvas"], activePanelId: "canvas" }]
    },
    // App Data opens from the toolbar, as a tab beside Properties.
    hidden: ["data"],
    sizes: { left: 260, right: 400, bottom: 240 }
  };
  if (name === "Canvas") { layout.hidden = ["components", "outline", "fields", "data", "assistant"]; }
  return layout;
}

/** The app builder's dock: the canvas is required, and layouts persist under `nodetool.app-builder-layout.v1`. */
export const appBuilderDockLayoutModel = createDockLayoutModel({
  editorLabel: "app builder",
  persistKeyPrefix: "nodetool.app-builder-layout.v1",
  requiredPanels: ["canvas"],
  presets: APP_BUILDER_LAYOUTS,
  createPreset
});
