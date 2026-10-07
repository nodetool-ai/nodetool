import { createElement, type ReactNode } from "react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VideogameAssetOutlinedIcon from "@mui/icons-material/VideogameAssetOutlined";

export type GameDimension = "2d" | "3d";
export type GamePanelRegion = "left" | "right" | "bottom" | "viewport";
export interface GamePanelRegistration {
  readonly id: string;
  readonly title: string;
  readonly icon: ReactNode;
  readonly dimensions: readonly GameDimension[];
  readonly defaultRegion: GamePanelRegion;
}
export interface GamePanelRegistry {
  readonly register: (panel: GamePanelRegistration) => () => void;
  readonly panels: (dimension: GameDimension) => readonly GamePanelRegistration[];
}

export function createGamePanelRegistry(): GamePanelRegistry {
  const entries = new Map<string, GamePanelRegistration>();
  return {
    register(panel) {
      if (entries.has(panel.id)) { throw new Error(`Game panel ${panel.id} is already registered`); }
      entries.set(panel.id, panel);
      return () => {
        if (entries.get(panel.id) === panel) { entries.delete(panel.id); }
      };
    },
    panels(dimension) { return [...entries.values()].filter((panel) => panel.dimensions.includes(dimension)); }
  };
}

export const gamePanelRegistry = createGamePanelRegistry();
const dimensions = ["2d", "3d"] as const;
for (const panel of [
  { id: "hierarchy", title: "Hierarchy", icon: createElement(AccountTreeOutlinedIcon), defaultRegion: "left" },
  { id: "revisions", title: "Revisions", icon: createElement(HistoryOutlinedIcon), defaultRegion: "left" },
  { id: "viewport", title: "Viewport", icon: createElement(VideogameAssetOutlinedIcon), defaultRegion: "viewport" },
  { id: "scripts", title: "Scripts", icon: createElement(CodeOutlinedIcon), defaultRegion: "bottom" },
  { id: "inspector", title: "Inspector", icon: createElement(TuneOutlinedIcon), defaultRegion: "right" },
  { id: "assistant", title: "Assistant", icon: createElement(AutoAwesomeOutlinedIcon), defaultRegion: "right" }
] satisfies readonly Omit<GamePanelRegistration, "dimensions">[]) {
  gamePanelRegistry.register({ ...panel, dimensions });
}
