import type { DockZone } from "../../ui_primitives";
import { GAME_PANEL_REGIONS, type GamePanelLayout, type GamePanelLayoutAction } from "../../../stores/game/GamePanelLayout";
import type { GamePanelRegion } from "./panelRegistry";

/** How a region lays out its groups: side panels stack them, the bottom and viewport rows place them side by side. */
export const GAME_REGION_AXIS: Readonly<Record<GamePanelRegion, "column" | "row">> = {
  left: "column", right: "column", bottom: "row", viewport: "row"
};

/** The zones a drop over a group's body can take: its center, or the edges along its region's axis. */
export const GAME_REGION_ZONES: Readonly<Record<GamePanelRegion, readonly DockZone[]>> = {
  left: ["center", "top", "bottom"],
  right: ["center", "top", "bottom"],
  bottom: ["center", "left", "right"],
  viewport: ["center", "left", "right"]
};

export const GAME_REGION_LABELS: Readonly<Record<GamePanelRegion, string>> = {
  left: "left dock", right: "right dock", bottom: "bottom dock", viewport: "center dock"
};

export type GameDockDropTarget =
  /** Insert as a tab before the `index`-th other tab of the group (or after the last). */
  | { readonly kind: "tab"; readonly region: GamePanelRegion; readonly groupId: string; readonly index: number }
  /** Drop over a group's body: `center` adds a tab, an edge splits the group. */
  | { readonly kind: "zone"; readonly region: GamePanelRegion; readonly groupId: string; readonly zone: DockZone }
  /** Drop on an empty region's edge target. */
  | { readonly kind: "region"; readonly region: GamePanelRegion };

export function uniqueGameGroupId(layout: GamePanelLayout, region: GamePanelRegion): string {
  const ids = new Set(GAME_PANEL_REGIONS.flatMap((entry) => layout.regions[entry].map((group) => group.id)));
  let index = 0;
  while (ids.has(`${region}-dock-${index}`)) { index += 1; }
  return `${region}-dock-${index}`;
}

/**
 * The layout action a drop performs, or null when it would change nothing.
 * `visible` filters a group's panels to the tabs on screen, which is what
 * the user aimed between.
 */
export function gameDockDropAction(layout: GamePanelLayout, panelId: string, target: GameDockDropTarget,
  visible: (id: string) => boolean): GamePanelLayoutAction | null {
  if (target.kind === "region") {
    return { type: "move", panelId, region: target.region, groupId: uniqueGameGroupId(layout, target.region), index: 0 };
  }
  const group = layout.regions[target.region].find((entry) => entry.id === target.groupId);
  if (!group) { return null; }
  const others = group.panels.filter((id) => id !== panelId);
  if (target.kind === "tab" || target.zone === "center") {
    if (target.kind !== "tab" && group.panels.includes(panelId)) { return null; }
    const shown = others.filter(visible);
    const requested = target.kind === "tab" ? Math.max(0, Math.min(target.index, shown.length)) : shown.length;
    const before = shown[requested];
    const after = shown[requested - 1];
    const index = before !== undefined ? others.indexOf(before) : after !== undefined ? others.indexOf(after) + 1 : others.length;
    if (group.panels.indexOf(panelId) === index && others.length === group.panels.length - 1) { return null; }
    return { type: "move", panelId, region: target.region, groupId: group.id, index };
  }
  if (others.length === 0) { return null; }
  const side = target.zone === "top" || target.zone === "left" ? "before" : "after";
  return { type: "move", panelId, region: target.region, groupId: uniqueGameGroupId(layout, target.region), index: 0,
    anchor: { groupId: group.id, side } };
}

/** The action for a "Move to … dock" menu item: a tab in the region's first group, or a new group there. */
export function gameDockMoveToRegion(layout: GamePanelLayout, panelId: string, region: GamePanelRegion): GamePanelLayoutAction {
  const first = layout.regions[region][0];
  if (!first) { return gameDockDropAction(layout, panelId, { kind: "region", region }, () => true) as GamePanelLayoutAction; }
  const others = first.panels.filter((id) => id !== panelId);
  return { type: "move", panelId, region, groupId: first.id, index: others.length };
}
