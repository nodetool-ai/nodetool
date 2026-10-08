import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";

import {
  createGamePanelLayout, gamePanelLayoutSchema, GAME_LAYOUT_PRESETS, registerMissingGamePanels, sameGamePanelLayout,
  transitionGamePanelLayout, type GamePanelLayout, type GamePanelLayoutAction
} from "./GamePanelLayout";
import type { GamePanelRegistration } from "../../components/game/shell/panelRegistry";

export interface GameLayoutStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

const MAX_SAVED_LAYOUTS = 32;
const layoutName = z.string().trim().min(1, "Enter a layout name").max(80, "Layout names are limited to 80 characters")
  .refine((name) => !GAME_LAYOUT_PRESETS.some((preset) => preset === name), { message: "Built-in layouts cannot be replaced" });
const savedLayout = z.object({ name: layoutName, layout: gamePanelLayoutSchema }).strict();
type SavedLayout = z.infer<typeof savedLayout>;

/** Throws the first issue's message, which the layout menu shows to the user. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) { throw new Error(parsed.error.issues[0]?.message ?? "Invalid game layout"); }
  return parsed.data;
}

/** Keeps each valid, uniquely named saved layout so one bad entry does not discard the others. */
function hydrateSavedLayouts(value: unknown): SavedLayout[] {
  if (!Array.isArray(value)) { return []; }
  const result: SavedLayout[] = [];
  for (const entry of value) {
    const parsed = savedLayout.safeParse(entry);
    if (!parsed.success || result.some((saved) => saved.name === parsed.data.name)) { continue; }
    result.push(parsed.data);
    if (result.length === MAX_SAVED_LAYOUTS) { break; }
  }
  return result;
}

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
    dispatch(action) {
      const current = get().layout;
      const next = transitionGamePanelLayout(current, action);
      if (next !== current) { set({ layout: next }); }
    },
    registerPanels(panels) {
      const current = get().layout;
      const next = registerMissingGamePanels(current, panels);
      if (next !== current) { set({ layout: next }); }
    },
    togglePanels(ids) {
      const shown = ids.some((id) => !get().layout.hidden.includes(id));
      let next = get().layout;
      for (const panelId of ids) { next = transitionGamePanelLayout(next, { type: shown ? "hide" : "reveal", panelId }); }
      if (next !== get().layout) { set({ layout: next }); }
    },
    saveLayout(name) {
      const validName = parseOrThrow(layoutName, name);
      const current = get();
      const existing = current.customLayouts.find((entry) => entry.name === validName);
      if (existing && sameGamePanelLayout(existing.layout, current.layout)) { return; }
      if (!existing && current.customLayouts.length >= MAX_SAVED_LAYOUTS) {
        throw new Error(`At most ${MAX_SAVED_LAYOUTS} layouts can be saved`);
      }
      set({ customLayouts: [...current.customLayouts.filter((entry) => entry.name !== validName),
        { name: validName, layout: parseOrThrow(gamePanelLayoutSchema, current.layout) }] });
    },
    selectLayout(name) {
      const preset = GAME_LAYOUT_PRESETS.find((entry) => entry === name);
      if (preset) { get().dispatch({ type: "preset", name: preset }); return; }
      const saved = get().customLayouts.find((entry) => entry.name === name);
      if (!saved) { throw new Error(`Saved layout ${name} does not exist`); }
      if (!sameGamePanelLayout(saved.layout, get().layout)) { set({ layout: parseOrThrow(gamePanelLayoutSchema, saved.layout) }); }
    },
    renameLayout(from, to) {
      const validName = parseOrThrow(layoutName, to);
      const current = get();
      if (!current.customLayouts.some((entry) => entry.name === from)) { throw new Error(`Saved layout ${from} does not exist`); }
      if (validName === from) { return; }
      if (current.customLayouts.some((entry) => entry.name === validName)) { throw new Error("Saved layout name is already used"); }
      set({ customLayouts: current.customLayouts.map((entry) => entry.name === from ? { ...entry, name: validName } : entry) });
    },
    deleteLayout(name) {
      const current = get().customLayouts;
      if (current.some((entry) => entry.name === name)) { set({ customLayouts: current.filter((entry) => entry.name !== name) }); }
    }
  }), {
    name: `nodetool.game-layout.v1:${namespace}`,
    version: 1,
    storage: createJSONStorage(() => guardedStorage),
    partialize: (state) => ({ layout: state.layout, customLayouts: state.customLayouts }),
    merge(persisted, current) {
      if (typeof persisted !== "object" || persisted === null) { return current; }
      const record = persisted as { readonly layout?: unknown; readonly customLayouts?: unknown };
      const layout = gamePanelLayoutSchema.safeParse(record.layout);
      return { ...current, layout: layout.success ? layout.data : current.layout, customLayouts: hydrateSavedLayouts(record.customLayouts) };
    }
  }));
}
