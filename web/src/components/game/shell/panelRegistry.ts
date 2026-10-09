import { createElement, type ReactNode } from "react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
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
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => readonly GamePanelRegistration[];
}

export function createGamePanelRegistry(): GamePanelRegistry {
  const entries = new Map<string, GamePanelRegistration>();
  const listeners = new Set<() => void>();
  let snapshot: readonly GamePanelRegistration[] = [];
  const publish = (): void => {
    snapshot = Object.freeze([...entries.values()]);
    for (const listener of listeners) { listener(); }
  };
  return {
    register(panel) {
      if (entries.has(panel.id)) { throw new Error(`Game panel ${panel.id} is already registered`); }
      const registration = Object.freeze({ ...panel, dimensions: Object.freeze([...panel.dimensions]) });
      entries.set(registration.id, registration);
      publish();
      return () => {
        if (entries.get(registration.id) === registration) {
          entries.delete(registration.id);
          publish();
        }
      };
    },
    panels(dimension) { return snapshot.filter((panel) => panel.dimensions.includes(dimension)); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot() { return snapshot; }
  };
}

export const gamePanelRegistry = createGamePanelRegistry();
const dimensions = ["2d", "3d"] as const;
for (const panel of [
  { id: "hierarchy", title: "Hierarchy", icon: createElement(AccountTreeOutlinedIcon), defaultRegion: "left" },
  { id: "revisions", title: "Revisions", icon: createElement(HistoryOutlinedIcon), defaultRegion: "left" },
  { id: "viewport", title: "Viewport", icon: createElement(VideogameAssetOutlinedIcon), defaultRegion: "viewport" },
  { id: "scripts", title: "Scripts", icon: createElement(CodeOutlinedIcon), defaultRegion: "bottom" },
  { id: "assets", title: "Assets", icon: createElement(PermMediaOutlinedIcon), defaultRegion: "bottom" },
  { id: "inspector", title: "Inspector", icon: createElement(TuneOutlinedIcon), defaultRegion: "right" },
  { id: "assistant", title: "Assistant", icon: createElement(AutoAwesomeOutlinedIcon), defaultRegion: "right" }
] satisfies readonly Omit<GamePanelRegistration, "dimensions">[]) {
  gamePanelRegistry.register({ ...panel, dimensions });
}
