import { z } from "zod";

import type { GamePanelRegistration, GamePanelRegion } from "../../components/game/shell/panelRegistry";

const panelId = z.string().min(1).max(256);
const group = z.object({
  id: panelId,
  panels: z.array(panelId).min(1).max(512),
  activePanelId: panelId
}).strict();
const groups = z.array(group).max(128);
export const GAME_PANEL_REGIONS = ["left", "right", "bottom", "viewport"] as const;
export const GAME_LAYOUT_PRESETS = ["Default", "Scripting", "Animation", "Wide"] as const;
export type GameLayoutPreset = typeof GAME_LAYOUT_PRESETS[number];

export const gamePanelLayoutSchema = z.object({
  version: z.literal(1),
  regions: z.object({ left: groups, right: groups, bottom: groups, viewport: groups }).strict(),
  hidden: z.array(panelId).max(512),
  sizes: z.object({
    left: z.number().finite().min(100).max(1600),
    right: z.number().finite().min(100).max(1600),
    bottom: z.number().finite().min(80).max(1000)
  }).strict()
}).strict().superRefine((layout, context) => {
  const panelIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const region of GAME_PANEL_REGIONS) {
    for (const entry of layout.regions[region]) {
      if (groupIds.has(entry.id)) { context.addIssue({ code: "custom", message: "Duplicate group placement" }); }
      groupIds.add(entry.id);
      if (!entry.panels.includes(entry.activePanelId)) {
        context.addIssue({ code: "custom", message: "Active panel is outside its group" });
      }
      for (const id of entry.panels) {
        if (panelIds.has(id)) { context.addIssue({ code: "custom", message: "Duplicate panel placement" }); }
        panelIds.add(id);
      }
    }
  }
  if (!panelIds.has("viewport") || layout.hidden.includes("viewport")) {
    context.addIssue({ code: "custom", message: "The viewport must remain available" });
  }
  if (new Set(layout.hidden).size !== layout.hidden.length) {
    context.addIssue({ code: "custom", message: "Duplicate hidden panel" });
  }
});

export type GamePanelLayout = z.infer<typeof gamePanelLayoutSchema>;
export type GamePanelGroup = GamePanelLayout["regions"][GamePanelRegion][number];
export type GamePanelLayoutAction =
  | { readonly type: "move"; readonly panelId: string; readonly region: GamePanelRegion; readonly groupId: string; readonly index: number }
  | { readonly type: "activate"; readonly panelId: string }
  | { readonly type: "hide"; readonly panelId: string }
  | { readonly type: "reveal"; readonly panelId: string }
  | { readonly type: "resize"; readonly region: "left" | "right" | "bottom"; readonly size: number }
  | { readonly type: "preset"; readonly name: GameLayoutPreset };

export function createGamePanelLayout(name: GameLayoutPreset = "Default"): GamePanelLayout {
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

function presetWithExtensions(layout: GamePanelLayout, name: GameLayoutPreset): GamePanelLayout {
  const preset = createGamePanelLayout(name);
  const builtInIds = new Set(GAME_PANEL_REGIONS.flatMap((region) => preset.regions[region].flatMap((entry) => entry.panels)));
  const groupIds = new Set(GAME_PANEL_REGIONS.flatMap((region) => preset.regions[region].map((entry) => entry.id)));
  let nextGroup = 0;
  for (const region of GAME_PANEL_REGIONS) {
    for (const prior of layout.regions[region]) {
      const panels = prior.panels.filter((id) => !builtInIds.has(id));
      if (panels.length === 0) { continue; }
      const sameGroup = preset.regions[region].find((entry) => entry.id === prior.id);
      if (sameGroup) {
        sameGroup.panels = [...sameGroup.panels, ...panels];
        continue;
      }
      let id = prior.id;
      while (groupIds.has(id)) { id = `preset-extension-${nextGroup}`; nextGroup += 1; }
      groupIds.add(id);
      preset.regions[region].push({ id, panels, activePanelId: panels.includes(prior.activePanelId) ? prior.activePanelId : panels[0] });
    }
  }
  preset.hidden = [...preset.hidden, ...layout.hidden.filter((id) => !builtInIds.has(id))];
  return gamePanelLayoutSchema.parse(preset);
}

export function hydrateGamePanelLayout(value: unknown): GamePanelLayout {
  const parsed = gamePanelLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : createGamePanelLayout();
}

export function registerMissingGamePanels(layout: GamePanelLayout, panels: readonly GamePanelRegistration[]): GamePanelLayout {
  const placed = new Set(GAME_PANEL_REGIONS.flatMap((region) => layout.regions[region].flatMap((entry) => entry.panels)));
  const groupIds = new Set(GAME_PANEL_REGIONS.flatMap((region) => layout.regions[region].map((entry) => entry.id)));
  let result = layout;
  let nextGroup = 0;
  for (const panel of panels) {
    if (placed.has(panel.id)) { continue; }
    const entries = result.regions[panel.defaultRegion];
    const target = entries[0];
    let groupId = `${panel.defaultRegion}-extension-${nextGroup}`;
    while (groupIds.has(groupId)) { nextGroup += 1; groupId = `${panel.defaultRegion}-extension-${nextGroup}`; }
    groupIds.add(groupId);
    const updated = target
      ? [{ ...target, panels: [...target.panels, panel.id] }, ...entries.slice(1)]
      : [{ id: groupId, panels: [panel.id], activePanelId: panel.id }];
    result = { ...result, regions: { ...result.regions, [panel.defaultRegion]: updated } };
    placed.add(panel.id);
  }
  return result === layout ? layout : gamePanelLayoutSchema.parse(result);
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Compares every persisted field, so callers can keep the current object when an action changes nothing. */
export function sameGamePanelLayout(a: GamePanelLayout, b: GamePanelLayout): boolean {
  return a === b || (a.version === b.version && sameIds(a.hidden, b.hidden)
    && a.sizes.left === b.sizes.left && a.sizes.right === b.sizes.right && a.sizes.bottom === b.sizes.bottom
    && GAME_PANEL_REGIONS.every((region) => a.regions[region].length === b.regions[region].length
      && a.regions[region].every((entry, index) => {
        const other = b.regions[region][index];
        return entry.id === other.id && entry.activePanelId === other.activePanelId && sameIds(entry.panels, other.panels);
      })));
}

/** Returns `layout` itself when the action changes nothing, so stores skip renders and persistence writes. */
export function transitionGamePanelLayout(layout: GamePanelLayout, action: GamePanelLayoutAction): GamePanelLayout {
  const next = applyGamePanelLayoutAction(layout, action);
  return sameGamePanelLayout(layout, next) ? layout : next;
}

function applyGamePanelLayoutAction(layout: GamePanelLayout, action: GamePanelLayoutAction): GamePanelLayout {
  if (action.type === "preset") { return presetWithExtensions(layout, action.name); }
  if (action.type === "resize") {
    return gamePanelLayoutSchema.parse({ ...layout, sizes: { ...layout.sizes, [action.region]: action.size } });
  }
  const sourceRegion = GAME_PANEL_REGIONS.find((region) => layout.regions[region].some((entry) => entry.panels.includes(action.panelId)));
  if (!sourceRegion) { throw new Error(`Game panel ${action.panelId} has no layout placement`); }
  if (action.type === "hide") {
    if (action.panelId === "viewport") { return layout; }
    return layout.hidden.includes(action.panelId) ? layout : gamePanelLayoutSchema.parse({ ...layout, hidden: [...layout.hidden, action.panelId] });
  }
  if (action.type === "activate" || action.type === "reveal") {
    const entries = layout.regions[sourceRegion].map((entry) => entry.panels.includes(action.panelId)
      ? { ...entry, activePanelId: action.panelId } : entry);
    return { ...layout, hidden: action.type === "reveal" ? layout.hidden.filter((id) => id !== action.panelId) : layout.hidden,
      regions: { ...layout.regions, [sourceRegion]: entries } };
  }
  if (!Number.isInteger(action.index) || action.index < 0) { throw new Error("Invalid panel insertion index"); }
  const targetRegion = GAME_PANEL_REGIONS.find((region) => layout.regions[region].some((entry) => entry.id === action.groupId));
  if (targetRegion && targetRegion !== action.region) { throw new Error("Dock group belongs to another region"); }
  const originalTarget = layout.regions[action.region].find((entry) => entry.id === action.groupId);
  if (originalTarget?.panels.length === 1 && originalTarget.panels[0] === action.panelId && action.index === 0) { return layout; }
  const regions = { ...layout.regions };
  regions[sourceRegion] = regions[sourceRegion].flatMap((entry) => {
    const panels = entry.panels.filter((id) => id !== action.panelId);
    return panels.length ? [{ ...entry, panels, activePanelId: entry.activePanelId === action.panelId ? panels[0] : entry.activePanelId }] : [];
  });
  const target = regions[action.region].find((entry) => entry.id === action.groupId);
  if (action.index > (target?.panels.length ?? 0)) { throw new Error("Panel insertion index exceeds group length"); }
  const panels = [...(target?.panels ?? [])];
  panels.splice(action.index, 0, action.panelId);
  const moved = { id: action.groupId, panels, activePanelId: action.panelId };
  regions[action.region] = target
    ? regions[action.region].map((entry) => entry.id === target.id ? moved : entry)
    : [...regions[action.region], moved];
  return gamePanelLayoutSchema.parse({ ...layout, regions });
}
