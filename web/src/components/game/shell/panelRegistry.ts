import { createElement } from "react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AnimationOutlinedIcon from "@mui/icons-material/AnimationOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VideogameAssetOutlinedIcon from "@mui/icons-material/VideogameAssetOutlined";

import type { DockRegion } from "../../../stores/dock/DockLayout";
import { createDockPanelRegistry, type DockPanelRegistration, type DockPanelRegistry } from "../../dock/panelRegistry";

export type GameDimension = "2d" | "3d";
export type GamePanelRegion = DockRegion;
export interface GamePanelRegistration extends DockPanelRegistration {
  readonly dimensions: readonly GameDimension[];
}
export interface GamePanelRegistry extends DockPanelRegistry<GamePanelRegistration> {
  readonly panels: (dimension: GameDimension) => readonly GamePanelRegistration[];
}

export function createGamePanelRegistry(): GamePanelRegistry {
  const registry = createDockPanelRegistry<GamePanelRegistration>("game", (panel) => ({ ...panel, dimensions: Object.freeze([...panel.dimensions]) }));
  return { ...registry, panels(dimension) { return registry.getSnapshot().filter((panel) => panel.dimensions.includes(dimension)); } };
}

export const gamePanelRegistry = createGamePanelRegistry();
const dimensions = ["2d", "3d"] as const;
for (const panel of [
  { id: "hierarchy", title: "Hierarchy", icon: createElement(AccountTreeOutlinedIcon), defaultRegion: "left" },
  { id: "revisions", title: "Revisions", icon: createElement(HistoryOutlinedIcon), defaultRegion: "left" },
  { id: "viewport", title: "Viewport", icon: createElement(VideogameAssetOutlinedIcon), defaultRegion: "viewport" },
  { id: "scripts", title: "Scripts", icon: createElement(CodeOutlinedIcon), defaultRegion: "bottom" },
  { id: "assets", title: "Assets", icon: createElement(PermMediaOutlinedIcon), defaultRegion: "bottom" },
  { id: "console", title: "Console", icon: createElement(TerminalOutlinedIcon), defaultRegion: "bottom" },
  { id: "profiler", title: "Profiler", icon: createElement(SpeedOutlinedIcon), defaultRegion: "bottom" },
  { id: "inspector", title: "Inspector", icon: createElement(TuneOutlinedIcon), defaultRegion: "right" },
  { id: "assistant", title: "Assistant", icon: createElement(AutoAwesomeOutlinedIcon), defaultRegion: "right" }
] satisfies readonly Omit<GamePanelRegistration, "dimensions">[]) {
  gamePanelRegistry.register({ ...panel, dimensions });
}
gamePanelRegistry.register({ id: "animation-graph", title: "Animation", icon: createElement(AnimationOutlinedIcon), dimensions: ["3d"], defaultRegion: "bottom" });
