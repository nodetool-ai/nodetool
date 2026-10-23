import { createDockLayoutModel, type DockLayout } from "../dock/DockLayout";

/** Every panel the timeline editor can dock. `program` and `tracks` are required. */
export const TIMELINE_PANEL_IDS = [
  "program", "source", "tracks", "transcript", "storyboard",
  "inspector", "shot", "instruments", "assistant", "history", "code"
] as const;
export type TimelinePanelId = typeof TIMELINE_PANEL_IDS[number];

/** The panels that share the right dock group in the built-in workspaces. */
export const TIMELINE_SIDE_PANEL_IDS: readonly TimelinePanelId[] = ["inspector", "shot", "instruments", "assistant", "history", "code"];

/** Built-in workspaces in menu order. The first is the default, and Alt+Shift+1 to 4 switch to them. */
export const TIMELINE_WORKSPACES = ["Editing", "Script", "Assistant", "Review"] as const;

const SIDE_PANELS = [...TIMELINE_SIDE_PANEL_IDS];

function createPreset(name: string): DockLayout {
  const layout: DockLayout = {
    version: 1,
    regions: {
      left: [{ id: "left-main", panels: ["transcript", "storyboard"], activePanelId: "transcript" }],
      right: [{ id: "right-main", panels: SIDE_PANELS, activePanelId: "inspector" }],
      bottom: [{ id: "bottom-main", panels: ["tracks"], activePanelId: "tracks" }],
      // The program and source monitors sit side by side, as in Premiere. Source shows while an asset is selected.
      viewport: [
        { id: "viewport-program", panels: ["program"], activePanelId: "program", weight: 1.6 },
        { id: "viewport-source", panels: ["source"], activePanelId: "source", weight: 1 }
      ]
    },
    hidden: [],
    sizes: { left: 320, right: 360, bottom: 300 }
  };
  if (name === "Script") {
    layout.sizes = { left: 480, right: 320, bottom: 240 };
    layout.hidden = ["source"];
  }
  if (name === "Assistant") {
    layout.regions.right[0].activePanelId = "assistant";
    layout.sizes = { left: 320, right: 520, bottom: 260 };
    layout.hidden = ["transcript", "storyboard", "source"];
  }
  if (name === "Review") {
    layout.sizes = { left: 320, right: 360, bottom: 220 };
    layout.hidden = ["transcript", "storyboard", "source", ...TIMELINE_SIDE_PANEL_IDS];
  }
  return layout;
}

/**
 * The timeline editor's dock. The program monitor and the tracks are required,
 * the tracks may take most of the height, and layouts persist under
 * `nodetool.timeline-layout.v1`.
 */
export const timelineDockLayoutModel = createDockLayoutModel({
  editorLabel: "timeline",
  persistKeyPrefix: "nodetool.timeline-layout.v1",
  requiredPanels: ["program", "tracks"],
  presets: TIMELINE_WORKSPACES,
  maxBottomFraction: 0.75,
  createPreset
});
