import {
  createDockLayoutModel, DOCK_REGIONS, sameDockLayout,
  type DockLayoutGroup, type DockLayout, type DockLayoutAction, type DockRegion
} from "../dock/DockLayout";

export const GAME_PANEL_REGIONS = DOCK_REGIONS;
export const GAME_LAYOUT_PRESETS = ["Default", "Scripting", "Animation", "Wide"] as const;
export type GameLayoutPreset = typeof GAME_LAYOUT_PRESETS[number];

export type GamePanelLayout = DockLayout;
export type GamePanelGroup = DockLayoutGroup;
export type GamePanelLayoutAction = DockLayoutAction;
export type GamePanelRegion = DockRegion;

function createPreset(name: string): GamePanelLayout {
  const layout: GamePanelLayout = {
    version: 1,
    regions: {
      left: [{ id: "left-main", panels: ["hierarchy", "revisions"], activePanelId: "hierarchy" }],
      right: [{ id: "right-main", panels: ["inspector", "assistant"], activePanelId: "inspector" }],
      bottom: [{ id: "bottom-main", panels: ["scripts"], activePanelId: "scripts" }],
      viewport: [{ id: "viewport-main", panels: ["viewport"], activePanelId: "viewport" }]
    },
    hidden: ["assistant"],
    sizes: { left: 280, right: 340, bottom: 240 }
  };
  if (name === "Scripting") { layout.sizes.bottom = 360; }
  if (name === "Animation") { layout.sizes.bottom = 320; }
  if (name === "Wide") { layout.hidden = ["hierarchy", "revisions", "inspector", "assistant", "scripts"]; }
  return layout;
}

/** The game editor's dock: the viewport is required, and layouts persist under `nodetool.game-layout.v1`. */
export const gameDockLayoutModel = createDockLayoutModel({
  editorLabel: "game",
  persistKeyPrefix: "nodetool.game-layout.v1",
  requiredPanels: ["viewport"],
  presets: GAME_LAYOUT_PRESETS,
  createPreset
});

export const gamePanelLayoutSchema = gameDockLayoutModel.schema;
export const createGamePanelLayout = (name: GameLayoutPreset = "Default"): GamePanelLayout => gameDockLayoutModel.createLayout(name);
export const hydrateGamePanelLayout = gameDockLayoutModel.hydrate;
export const registerMissingGamePanels = gameDockLayoutModel.registerMissingPanels;
export const sameGamePanelLayout = sameDockLayout;
export const transitionGamePanelLayout = gameDockLayoutModel.transition;
