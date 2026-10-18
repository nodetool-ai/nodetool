import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import {
  capitalizeLabel, dockGroupOfPanel, sameDockLayout,
  type DockLayout, type DockLayoutAction, type DockLayoutModel, type DockPanelRegistration
} from "./DockLayout";

export interface DockLayoutStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export type DockLayoutScope = { readonly userId: string } | { readonly anonymous: true };

const MAX_SAVED_LAYOUTS = 32;

/** Throws the first issue's message, which the layout menu shows to the user. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, fallback: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) { throw new Error(parsed.error.issues[0]?.message ?? fallback); }
  return parsed.data;
}

export interface DockLayoutState {
  /** The editor's dock configuration: required panels, built-in presets, labels. Not persisted. */
  readonly model: DockLayoutModel;
  readonly layout: DockLayout;
  readonly customLayouts: ReadonlyArray<{ readonly name: string; readonly layout: DockLayout }>;
  /** The built-in or saved layout the user last chose, saved or renamed. `resetLayout` returns to it. */
  readonly activeLayoutName: string;
  /** The group filling the dock, or null. Not persisted, so a reload restores the full layout. */
  readonly maximizedGroupId: string | null;
  readonly dispatch: (action: DockLayoutAction) => void;
  readonly registerPanels: (panels: readonly DockPanelRegistration[]) => void;
  readonly togglePanels: (ids: readonly string[]) => void;
  /** Shows a hidden panel and makes it the active tab of its group. Leaves maximize if the panel is outside the maximized group. */
  readonly revealPanel: (panelId: string) => void;
  readonly setMaximizedGroup: (groupId: string | null) => void;
  readonly toggleMaximizedGroup: (groupId: string) => void;
  /** Maximizes the group holding `panelId` and activates the panel, or restores the layout when that group is already maximized. */
  readonly toggleMaximizedPanel: (panelId: string) => void;
  readonly saveLayout: (name: string) => void;
  readonly selectLayout: (name: string) => void;
  /** Re-applies the active built-in or saved layout and leaves maximize, discarding moves, resizes and hidden panels made since. */
  readonly resetLayout: () => void;
  readonly renameLayout: (from: string, to: string) => void;
  readonly deleteLayout: (name: string) => void;
}

/** The store key for `scope`, e.g. `nodetool.game-layout.v1:user:abc`. */
export function dockLayoutStorageKey(model: Pick<DockLayoutModel, "persistKeyPrefix">, scope: DockLayoutScope): string {
  return `${model.persistKeyPrefix}:${"userId" in scope ? `user:${encodeURIComponent(scope.userId)}` : "anonymous"}`;
}

export function createDockLayoutStore(model: DockLayoutModel, scope: DockLayoutScope, storage: DockLayoutStorage) {
  const label = capitalizeLabel(model.editorLabel);
  const layoutName = z.string().trim().min(1, "Enter a layout name").max(80, "Layout names are limited to 80 characters")
    .refine((name) => !model.presets.some((preset) => preset === name), { message: "Built-in layouts cannot be replaced" });
  const savedLayout = z.object({ name: layoutName, layout: model.schema }).strict();
  type SavedLayout = z.infer<typeof savedLayout>;
  /** Keeps each valid, uniquely named saved layout so one bad entry does not discard the others. */
  const hydrateSavedLayouts = (value: unknown): SavedLayout[] => {
    if (!Array.isArray(value)) { return []; }
    const result: SavedLayout[] = [];
    for (const entry of value) {
      const parsed = savedLayout.safeParse(entry);
      if (!parsed.success || result.some((saved) => saved.name === parsed.data.name)) { continue; }
      result.push(parsed.data);
      if (result.length === MAX_SAVED_LAYOUTS) { break; }
    }
    return result;
  };
  const guardedStorage: DockLayoutStorage = {
    getItem(key) {
      try { return storage.getItem(key); }
      catch { return null; }
    },
    setItem(key, value) {
      try { storage.setItem(key, value); }
      catch { /* The in-memory layout remains usable when browser storage is unavailable. */ }
    },
    removeItem(key) {
      try { storage.removeItem(key); }
      catch { /* The current layout does not depend on removing persisted browser data. */ }
    }
  };
  return createStore<DockLayoutState>()(persist((set, get) => ({
    model,
    layout: model.createLayout(),
    customLayouts: [],
    activeLayoutName: model.presets[0] ?? "",
    maximizedGroupId: null,
    dispatch(action) {
      const current = get().layout;
      const next = model.transition(current, action);
      if (next !== current) { set({ layout: next }); }
    },
    registerPanels(panels) {
      const current = get().layout;
      const next = model.registerMissingPanels(current, panels);
      if (next !== current) { set({ layout: next }); }
    },
    togglePanels(ids) {
      const shown = ids.some((id) => !get().layout.hidden.includes(id));
      let next = get().layout;
      for (const panelId of ids) { next = model.transition(next, { type: shown ? "hide" : "reveal", panelId }); }
      if (next !== get().layout) { set({ layout: next }); }
    },
    revealPanel(panelId) {
      get().dispatch({ type: "reveal", panelId });
      const { layout, maximizedGroupId } = get();
      if (maximizedGroupId && dockGroupOfPanel(layout, panelId)?.id !== maximizedGroupId) { set({ maximizedGroupId: null }); }
    },
    setMaximizedGroup(groupId) {
      if (groupId !== get().maximizedGroupId) { set({ maximizedGroupId: groupId }); }
    },
    toggleMaximizedGroup(groupId) {
      set({ maximizedGroupId: get().maximizedGroupId === groupId ? null : groupId });
    },
    toggleMaximizedPanel(panelId) {
      const group = dockGroupOfPanel(get().layout, panelId);
      if (!group) { throw new Error(`${label} panel ${panelId} has no layout placement`); }
      if (get().maximizedGroupId === group.id) { set({ maximizedGroupId: null }); return; }
      get().dispatch({ type: "activate", panelId });
      set({ maximizedGroupId: group.id });
    },
    saveLayout(name) {
      const validName = parseOrThrow(layoutName, name, `Invalid ${model.editorLabel} layout`);
      const current = get();
      const existing = current.customLayouts.find((entry) => entry.name === validName);
      if (existing && sameDockLayout(existing.layout, current.layout)) {
        if (current.activeLayoutName !== validName) { set({ activeLayoutName: validName }); }
        return;
      }
      if (!existing && current.customLayouts.length >= MAX_SAVED_LAYOUTS) {
        throw new Error(`At most ${MAX_SAVED_LAYOUTS} layouts can be saved`);
      }
      set({ customLayouts: [...current.customLayouts.filter((entry) => entry.name !== validName),
        { name: validName, layout: parseOrThrow(model.schema, current.layout, `Invalid ${model.editorLabel} layout`) }],
      activeLayoutName: validName });
    },
    selectLayout(name) {
      const preset = model.presets.find((entry) => entry === name);
      if (preset) {
        get().dispatch({ type: "preset", name: preset });
        if (get().activeLayoutName !== preset) { set({ activeLayoutName: preset }); }
        return;
      }
      const saved = get().customLayouts.find((entry) => entry.name === name);
      if (!saved) { throw new Error(`Saved layout ${name} does not exist`); }
      if (!sameDockLayout(saved.layout, get().layout)) {
        set({ layout: parseOrThrow(model.schema, saved.layout, `Invalid ${model.editorLabel} layout`) });
      }
      if (get().activeLayoutName !== saved.name) { set({ activeLayoutName: saved.name }); }
    },
    resetLayout() {
      const { activeLayoutName, customLayouts } = get();
      const known = model.presets.some((preset) => preset === activeLayoutName) || customLayouts.some((entry) => entry.name === activeLayoutName);
      get().selectLayout(known ? activeLayoutName : model.presets[0] ?? "");
      get().setMaximizedGroup(null);
    },
    renameLayout(from, to) {
      const validName = parseOrThrow(layoutName, to, `Invalid ${model.editorLabel} layout`);
      const current = get();
      if (!current.customLayouts.some((entry) => entry.name === from)) { throw new Error(`Saved layout ${from} does not exist`); }
      if (validName === from) { return; }
      if (current.customLayouts.some((entry) => entry.name === validName)) { throw new Error("Saved layout name is already used"); }
      set({ customLayouts: current.customLayouts.map((entry) => entry.name === from ? { ...entry, name: validName } : entry),
        activeLayoutName: current.activeLayoutName === from ? validName : current.activeLayoutName });
    },
    deleteLayout(name) {
      const current = get().customLayouts;
      if (current.some((entry) => entry.name === name)) {
        set({ customLayouts: current.filter((entry) => entry.name !== name),
          activeLayoutName: get().activeLayoutName === name ? model.presets[0] ?? "" : get().activeLayoutName });
      }
    }
  }), {
    name: dockLayoutStorageKey(model, scope),
    version: 1,
    storage: createJSONStorage(() => guardedStorage),
    partialize: (state) => ({ layout: state.layout, customLayouts: state.customLayouts, activeLayoutName: state.activeLayoutName }),
    merge(persisted, current) {
      if (typeof persisted !== "object" || persisted === null) { return current; }
      const record = persisted as { readonly layout?: unknown; readonly customLayouts?: unknown; readonly activeLayoutName?: unknown };
      const layout = model.schema.safeParse(record.layout);
      const customLayouts = hydrateSavedLayouts(record.customLayouts);
      const name = record.activeLayoutName;
      const activeLayoutName = typeof name === "string" && (model.presets.some((preset) => preset === name) || customLayouts.some((entry) => entry.name === name))
        ? name : current.activeLayoutName;
      return { ...current, layout: layout.success ? layout.data : current.layout, customLayouts, activeLayoutName };
    }
  }));
}
