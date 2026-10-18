import { z } from "zod";

/** The four places a dock group can sit. Editors decide which panels start where. */
export const DOCK_REGIONS = ["left", "right", "bottom", "viewport"] as const;
export type DockRegion = typeof DOCK_REGIONS[number];

/** What an editor registers for each panel it can dock. */
export interface DockPanelRegistration {
  readonly id: string;
  readonly title: string;
  readonly icon: unknown;
  readonly defaultRegion: DockRegion;
}

const panelId = z.string().min(1).max(256);
const group = z.object({
  id: panelId,
  panels: z.array(panelId).min(1).max(512),
  activePanelId: panelId,
  /** Share of its region's length, relative to the other groups there. Absent means 1. */
  weight: z.number().finite().min(0.05).max(20).optional()
}).strict();
const groups = z.array(group).max(128);

const baseDockLayoutSchema = z.object({
  version: z.literal(1),
  regions: z.object({ left: groups, right: groups, bottom: groups, viewport: groups }).strict(),
  hidden: z.array(panelId).max(512),
  sizes: z.object({
    left: z.number().finite().min(100).max(1600),
    right: z.number().finite().min(100).max(1600),
    bottom: z.number().finite().min(80).max(1000)
  }).strict()
}).strict();

export type DockLayout = z.infer<typeof baseDockLayoutSchema>;
export type DockLayoutGroup = DockLayout["regions"][DockRegion][number];
export type DockLayoutAction =
  | {
    readonly type: "move"; readonly panelId: string; readonly region: DockRegion; readonly groupId: string; readonly index: number;
    /** Where a new group goes in its region: beside this group, else at the end. */
    readonly anchor?: { readonly groupId: string; readonly side: "before" | "after" };
  }
  | { readonly type: "resizeGroups"; readonly region: DockRegion; readonly weights: Readonly<Record<string, number>> }
  | { readonly type: "activate"; readonly panelId: string }
  | { readonly type: "hide"; readonly panelId: string }
  | { readonly type: "reveal"; readonly panelId: string }
  | { readonly type: "resize"; readonly region: "left" | "right" | "bottom"; readonly size: number }
  | { readonly type: "preset"; readonly name: string };

/** Everything an editor decides about its dock. The rest of the layout model is shared. */
export interface DockLayoutConfig {
  /** Lowercase noun for the editor, used in accessible names such as "Resize game left panels". */
  readonly editorLabel: string;
  /** Storage key prefix. The store appends `:<namespace>`, e.g. `nodetool.game-layout.v1`. */
  readonly persistKeyPrefix: string;
  /** Panels that cannot be hidden or closed, and must be placed in every layout. */
  readonly requiredPanels: readonly string[];
  /** Built-in layout names in menu order. The first is the default. Saved layouts cannot reuse them. */
  readonly presets: readonly string[];
  /** Largest share of the dock's height the bottom region may take. Absent means one half. */
  readonly maxBottomFraction?: number;
  /** Builds the built-in layout with this name. */
  readonly createPreset: (name: string) => DockLayout;
}

export interface DockLayoutModel extends DockLayoutConfig {
  readonly schema: z.ZodType<DockLayout>;
  readonly createLayout: (name?: string) => DockLayout;
  readonly hydrate: (value: unknown) => DockLayout;
  readonly registerMissingPanels: (layout: DockLayout, panels: readonly DockPanelRegistration[]) => DockLayout;
  /** Returns `layout` itself when the action changes nothing, so stores skip renders and persistence writes. */
  readonly transition: (layout: DockLayout, action: DockLayoutAction) => DockLayout;
}

export function capitalizeLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function allDockGroups(layout: DockLayout): DockLayoutGroup[] {
  return DOCK_REGIONS.flatMap((region) => layout.regions[region]);
}

export function dockRegionOfGroup(layout: DockLayout, groupId: string): DockRegion | undefined {
  return DOCK_REGIONS.find((region) => layout.regions[region].some((entry) => entry.id === groupId));
}

export function dockGroupOfPanel(layout: DockLayout, panelId: string): DockLayoutGroup | undefined {
  return allDockGroups(layout).find((entry) => entry.panels.includes(panelId));
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Compares every persisted field, so callers can keep the current object when an action changes nothing. */
export function sameDockLayout(a: DockLayout, b: DockLayout): boolean {
  return a === b || (a.version === b.version && sameIds(a.hidden, b.hidden)
    && a.sizes.left === b.sizes.left && a.sizes.right === b.sizes.right && a.sizes.bottom === b.sizes.bottom
    && DOCK_REGIONS.every((region) => a.regions[region].length === b.regions[region].length
      && a.regions[region].every((entry, index) => {
        const other = b.regions[region][index];
        return entry.id === other.id && entry.activePanelId === other.activePanelId && entry.weight === other.weight
          && sameIds(entry.panels, other.panels);
      })));
}

export function createDockLayoutModel(config: DockLayoutConfig): DockLayoutModel {
  if (config.presets.length === 0) { throw new Error("A dock needs at least one preset"); }
  const required = new Set(config.requiredPanels);
  const schema: z.ZodType<DockLayout> = baseDockLayoutSchema.superRefine((layout, context) => {
    const panelIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const region of DOCK_REGIONS) {
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
    for (const id of required) {
      if (!panelIds.has(id) || layout.hidden.includes(id)) {
        context.addIssue({ code: "custom", message: `The ${id} must remain available` });
      }
    }
    if (new Set(layout.hidden).size !== layout.hidden.length) {
      context.addIssue({ code: "custom", message: "Duplicate hidden panel" });
    }
  });

  const createLayout = (name: string = config.presets[0] ?? ""): DockLayout => schema.parse(config.createPreset(name));

  function presetWithExtensions(layout: DockLayout, name: string): DockLayout {
    const preset = createLayout(name);
    const builtInIds = new Set(allDockGroups(preset).flatMap((entry) => entry.panels));
    const groupIds = new Set(allDockGroups(preset).map((entry) => entry.id));
    let nextGroup = 0;
    for (const region of DOCK_REGIONS) {
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
    return schema.parse(preset);
  }

  function registerMissingPanels(layout: DockLayout, panels: readonly DockPanelRegistration[]): DockLayout {
    const placed = new Set(allDockGroups(layout).flatMap((entry) => entry.panels));
    const groupIds = new Set(allDockGroups(layout).map((entry) => entry.id));
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
    return result === layout ? layout : schema.parse(result);
  }

  function apply(layout: DockLayout, action: DockLayoutAction): DockLayout {
    if (action.type === "preset") { return presetWithExtensions(layout, action.name); }
    if (action.type === "resize") {
      return schema.parse({ ...layout, sizes: { ...layout.sizes, [action.region]: action.size } });
    }
    if (action.type === "resizeGroups") {
      const entries = layout.regions[action.region].map((entry) => {
        const weight = action.weights[entry.id];
        return weight === undefined ? entry : { ...entry, weight };
      });
      return schema.parse({ ...layout, regions: { ...layout.regions, [action.region]: entries } });
    }
    const sourceRegion = DOCK_REGIONS.find((region) => layout.regions[region].some((entry) => entry.panels.includes(action.panelId)));
    if (!sourceRegion) { throw new Error(`${capitalizeLabel(config.editorLabel)} panel ${action.panelId} has no layout placement`); }
    if (action.type === "hide") {
      if (required.has(action.panelId)) { return layout; }
      return layout.hidden.includes(action.panelId) ? layout : schema.parse({ ...layout, hidden: [...layout.hidden, action.panelId] });
    }
    if (action.type === "activate" || action.type === "reveal") {
      const entries = layout.regions[sourceRegion].map((entry) => entry.panels.includes(action.panelId)
        ? { ...entry, activePanelId: action.panelId } : entry);
      return { ...layout, hidden: action.type === "reveal" ? layout.hidden.filter((id) => id !== action.panelId) : layout.hidden,
        regions: { ...layout.regions, [sourceRegion]: entries } };
    }
    if (!Number.isInteger(action.index) || action.index < 0) { throw new Error("Invalid panel insertion index"); }
    const targetRegion = dockRegionOfGroup(layout, action.groupId);
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
    const moved = target ? { ...target, panels, activePanelId: action.panelId } : { id: action.groupId, panels, activePanelId: action.panelId };
    if (target) {
      regions[action.region] = regions[action.region].map((entry) => entry.id === target.id ? moved : entry);
    } else {
      const entries = [...regions[action.region]];
      const anchorIndex = action.anchor ? entries.findIndex((entry) => entry.id === action.anchor?.groupId) : -1;
      entries.splice(anchorIndex < 0 ? entries.length : anchorIndex + (action.anchor?.side === "after" ? 1 : 0), 0, moved);
      regions[action.region] = entries;
    }
    return schema.parse({ ...layout, regions });
  }

  return {
    ...config,
    schema,
    createLayout,
    hydrate(value) {
      const parsed = schema.safeParse(value);
      return parsed.success ? parsed.data : createLayout();
    },
    registerMissingPanels,
    transition(layout, action) {
      const next = apply(layout, action);
      return sameDockLayout(layout, next) ? layout : next;
    }
  };
}
