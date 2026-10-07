import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import {
  createGamePanelLayout, gamePanelLayoutSchema, GAME_LAYOUT_PRESETS, registerMissingGamePanels,
  transitionGamePanelLayout, type GamePanelLayout, type GamePanelLayoutAction
} from "./GamePanelLayout";
import type { GamePanelRegistration } from "../../components/game/shell/panelRegistry";

export interface GameLayoutStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

const layoutName = z.string().trim().min(1).max(80).refine((name) => !GAME_LAYOUT_PRESETS.some((preset) => preset === name), {
  message: "Built-in layouts cannot be replaced"
});
const persistedLayouts = z.object({
  layout: gamePanelLayoutSchema,
  customLayouts: z.array(z.object({ name: layoutName, layout: gamePanelLayoutSchema }).strict()).max(32)
}).strict().superRefine((value, context) => {
  if (new Set(value.customLayouts.map((entry) => entry.name)).size !== value.customLayouts.length) {
    context.addIssue({ code: "custom", message: "Duplicate saved layout name" });
  }
});

export interface GamePanelLayoutState {
  readonly layout: GamePanelLayout;
  readonly customLayouts: ReadonlyArray<{ readonly name: string; readonly layout: GamePanelLayout }>;
  readonly dispatch: (action: GamePanelLayoutAction) => void;
  readonly registerPanels: (panels: readonly GamePanelRegistration[]) => void;
  readonly togglePanels: (ids: readonly string[]) => void;
  readonly saveLayout: (name: string) => void;
  readonly selectLayout: (name: string) => void;
  readonly renameLayout: (from: string, to: string) => void;
  readonly deleteLayout: (name: string) => void;
}

export function createGamePanelLayoutStore(scope: { readonly userId: string } | { readonly anonymous: true }, storage: GameLayoutStorage) {
  const namespace = "userId" in scope ? `user:${encodeURIComponent(scope.userId)}` : "anonymous";
  const guardedStorage: GameLayoutStorage = {
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
  return createStore<GamePanelLayoutState>()(persist((set, get) => ({
    layout: createGamePanelLayout(),
    customLayouts: [],
    dispatch(action) { set({ layout: transitionGamePanelLayout(get().layout, action) }); },
    registerPanels(panels) {
      const current = get().layout;
      const next = registerMissingGamePanels(current, panels);
      if (next !== current) { set({ layout: next }); }
    },
    togglePanels(ids) {
      const shown = ids.some((id) => !get().layout.hidden.includes(id));
      let next = get().layout;
      for (const panelId of ids) { next = transitionGamePanelLayout(next, { type: shown ? "hide" : "reveal", panelId }); }
      set({ layout: next });
    },
    saveLayout(name) {
      const validName = layoutName.parse(name);
      const current = get();
      const customLayouts = [...current.customLayouts.filter((entry) => entry.name !== validName), { name: validName, layout: current.layout }];
      const validated = persistedLayouts.parse({ layout: current.layout, customLayouts });
      set({ customLayouts: validated.customLayouts });
    },
    selectLayout(name) {
      const preset = GAME_LAYOUT_PRESETS.find((entry) => entry === name);
      if (preset) { get().dispatch({ type: "preset", name: preset }); return; }
      const saved = get().customLayouts.find((entry) => entry.name === name);
      if (!saved) { throw new Error(`Saved layout ${name} does not exist`); }
      set({ layout: gamePanelLayoutSchema.parse(saved.layout) });
    },
    renameLayout(from, to) {
      const validName = layoutName.parse(to);
      const current = get();
      if (!current.customLayouts.some((entry) => entry.name === from)) { throw new Error(`Saved layout ${from} does not exist`); }
      if (current.customLayouts.some((entry) => entry.name === validName && entry.name !== from)) { throw new Error("Saved layout name is already used"); }
      set({ customLayouts: current.customLayouts.map((entry) => entry.name === from ? { ...entry, name: validName } : entry) });
    },
    deleteLayout(name) { set({ customLayouts: get().customLayouts.filter((entry) => entry.name !== name) }); }
  }), {
    name: `nodetool.game-layout.v1:${namespace}`,
    version: 1,
    storage: createJSONStorage(() => guardedStorage),
    partialize: (state) => ({ layout: state.layout, customLayouts: state.customLayouts }),
    merge(persisted, current) {
      const parsed = persistedLayouts.safeParse(persisted);
      return parsed.success ? { ...current, ...parsed.data } : current;
    }
  }));
}
