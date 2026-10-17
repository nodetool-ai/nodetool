// WT-1 editor store, one per open editor. Every control reads its value from
// here and writes back through `setParam`, which forwards the change to the
// track's live device at once and hands the whole record to the host, which
// stores it in the timeline document. The document stays the source of
// truth: undo and edits made elsewhere come back through `syncParams`.
//
// Upstream FableSynth kept one global store for its one synth. The timeline
// can show several WT-1 tracks at a time, so the store is created per editor
// and handed down through React context.

import { createContext, createElement, useContext, type ReactNode } from 'react';
import { createStore, useStore as useZustandStore, type StoreApi } from 'zustand';
import { defaultParams, TABLE_NAMES, type ModConnection, type ParamValues } from './params';
import { FACTORY_PRESETS, loadUserPresets, resolvePresetMods, saveUserPreset, type Preset } from './presets';
import { findFreeSlot, setMatSlot, clearSlot as clearSlotIn, MOD_DEFAULT_AMT } from './store/slotHelpers';
import {
  loadUserTablePool, saveUserTablePool, serializeUserTable, deserializeUserTable,
  makeUserTable, framesFromGenerated, type UserTable,
} from './engine/usertables';
import { factoryTables, SIZE } from './engine/wavetables';
import type { VizTable } from './engine/synth';
import { Wt1EngineLink } from './engine/wt1Link';
import { createModLive, feedModLive, type ModLive } from './engine/modLive';

export { factoryTables } from './engine/wavetables';

export interface PresetOption {
  value: string; // 'f<i>' factory | 'u<i>' user
  name: string;
  group: 'FACTORY' | 'USER';
}

export interface SoundSnapshot {
  presetValue: string;
  params: ParamValues;
  dirty: boolean;
  userTables: UserTable[];
}

export function presetOptions(userPresets: Preset[]): PresetOption[] {
  const opts: PresetOption[] = FACTORY_PRESETS.map((p, i) => ({ value: 'f' + i, name: p.name, group: 'FACTORY' as const }));
  userPresets.forEach((p, i) => opts.push({ value: 'u' + i, name: p.name, group: 'USER' }));
  return opts;
}

const sameParams = (a: ParamValues, b: ParamValues): boolean => {
  for (const id in a) if (a[id] !== b[id]) return false;
  for (const id in b) if (!(id in a)) return false;
  return true;
};

const nearParams = (a: ParamValues, b: ParamValues): boolean => {
  for (const id in a) {
    const x = a[id], y = b[id];
    if (y === undefined || Math.abs(x - y) > 1e-4 * Math.max(1, Math.abs(x))) return false;
  }
  return true;
};

/** The preset whose sound `params` is, as a preset value ('' when none matches). */
export function matchPreset(params: ParamValues, userPresets: Preset[]): string {
  const f = FACTORY_PRESETS.findIndex((p) => nearParams(resolvePresetMods(p.params, p.mods), params));
  if (f >= 0) return 'f' + f;
  const u = userPresets.findIndex((p) => nearParams(resolvePresetMods(p.params, p.mods), params));
  return u >= 0 ? 'u' + u : '';
}

function vizTables(userTables: UserTable[]): VizTable[] {
  return [...factoryTables(), ...userTables.map((u) => u.table)].map((t) => ({ name: t.name, frames: t.frames, viz: t.viz }));
}

export interface Wt1StoreOptions {
  params?: ParamValues;
  /** Store the record in the document. Called after every change made here. */
  commit?: (params: ParamValues) => void;
}

export interface SynthStore {
  params: ParamValues;
  /** The track's live device, as far as the editor sees it. */
  engine: Wt1EngineLink;
  /** Live modulation sums for the knob dots. */
  modLive: ModLive;
  /** Waveform previews of every table the oscillators address. */
  tables: VizTable[];
  modDrag: number; // source being dragged (MOD_SOURCES index), 0 = none
  modFocus: number; // source chip under the pointer; its rings light up, 0 = none
  powered: boolean; // a device is attached
  hosted: boolean; // inside SQ-4 upstream; always false on the timeline
  voiceCount: number;
  modPosA: number;
  modPosB: number;
  midiActive: boolean;
  octave: number;
  activeNotes: Set<number>;
  userPresets: Preset[];
  presetValue: string;
  // True once any param has changed since the last preset load/save; drives
  // the small dirty indicator next to the preset select.
  dirty: boolean;
  userTables: UserTable[];
  editorOsc: 'oscA' | 'oscB' | null;

  setParam: (id: string, v: number) => void;
  /** Replace the record with the document's (undo, edits elsewhere). Not committed back. */
  syncParams: (params: ParamValues) => void;
  // Modulation routing over the 16 fixed `mat{n}` slots (params-as-truth):
  // addRoute allocates the next free slot; updateSlot/clearSlot edit a slot by
  // its absolute number (1..16).
  addRoute: (src: number, dst: number, amt?: number) => void;
  updateSlot: (slot: number, patch: Partial<ModConnection>) => void;
  clearSlot: (slot: number) => void;
  setModDrag: (src: number) => void;
  setModFocus: (src: number) => void;
  applyPreset: (presetParams: Partial<ParamValues>, mods?: ModConnection[]) => void;
  loadPresetByValue: (val: string) => void;
  stepPreset: (d: number) => void;
  savePreset: (name: string) => void;
  // Preset browser: capture the current sound, restore it exactly (revert / A-B),
  // and apply an unsaved variant of the loaded preset.
  captureSound: () => SoundSnapshot;
  restoreSound: (snap: SoundSnapshot) => void;
  applyVariant: (params: ParamValues) => void;

  addUserTable: (u: UserTable) => void;
  deleteUserTable: (poolIndex: number) => void;
  renameUserTable: (poolIndex: number, name: string) => void;
  updateUserTable: (poolIndex: number, u: UserTable) => void;
  duplicateUserTable: (poolIndex: number) => void;
  duplicateFactoryTable: (factoryIndex: number) => void;
  openEditor: (osc: 'oscA' | 'oscB') => void;
  closeEditor: () => void;

  playNote: (n: number, vel: number) => void;
  setActive: (note: number, on: boolean) => void;
  panic: () => void;
  bend: (semis: number) => void;
  setOctave: (o: number) => void;
  setMidiActive: (on: boolean) => void;
  /** Stop following the device; call when the editor unmounts. */
  dispose: () => void;
}

export type Wt1StoreApi = StoreApi<SynthStore>;

export function createWt1Store(options: Wt1StoreOptions = {}): Wt1StoreApi {
  const engine = new Wt1EngineLink();
  const modLive = createModLive();
  const commit = options.commit ?? (() => {});
  const userPresets = loadUserPresets();
  const userTables = loadUserTablePool();
  const initial = { ...defaultParams(), ...options.params };

  return createStore<SynthStore>((set, get) => {
    const unsubscribers: Array<() => void> = [
      engine.onChange(() => {
        // A new device starts from the document's record; bring it up to date
        // with the pool and any edit the document has not caught up with.
        engine.setUserTables(get().userTables.map((t) => t.table));
        engine.applyParams(get().params);
        set({ powered: engine.current !== null, voiceCount: 0, modPosA: -1, modPosB: -1 });
      }),
      // Worklet->UI telemetry: modulated wavetable positions for the displays,
      // and the live per-destination sums the knob dots animate from.
      engine.subscribeViz((d) => set({ voiceCount: d.n, modPosA: d.a >= 0 ? d.a : -1, modPosB: d.b >= 0 ? d.b : -1 })),
      engine.subscribeMod((d) => feedModLive(modLive, d)),
    ];

    const setPool = (pool: UserTable[]) => {
      saveUserTablePool(pool);
      engine.setUserTables(pool.map((t) => t.table));
      set({ userTables: pool, tables: vizTables(pool) });
    };

    const replaceParams = (params: ParamValues, dirty: boolean) => {
      engine.panic();
      engine.applyParams(params);
      set({ params, dirty });
      commit(params);
    };

    return {
      params: initial,
      engine,
      modLive,
      tables: vizTables(userTables),
      modDrag: 0,
      modFocus: 0,
      powered: false,
      hosted: false,
      voiceCount: 0,
      modPosA: -1,
      modPosB: -1,
      midiActive: false,
      octave: 0,
      activeNotes: new Set<number>(),
      userPresets,
      presetValue: matchPreset(initial, userPresets),
      dirty: false,
      userTables,
      editorOsc: null,

      setParam: (id, v) => {
        if (!Number.isFinite(v) || get().params[id] === v) return;
        engine.setParam(id, v);
        const params = { ...get().params, [id]: v };
        set({ params, dirty: true });
        commit(params);
      },

      syncParams: (params) => {
        if (sameParams(params, get().params)) return;
        engine.applyParams(params);
        set({ params, presetValue: matchPreset(params, get().userPresets), dirty: false });
      },

      // Allocate the next fully-empty slot and write the route into it. The matrix
      // ADD ROUTE button passes dst=0 to claim a slot that is editable but inactive
      // until a destination is chosen.
      addRoute: (src, dst, amt = MOD_DEFAULT_AMT) => {
        const slot = findFreeSlot(get().params);
        if (!slot) return; // pool full
        const next = { ...get().params };
        setMatSlot(next, slot, { src, dst, amt });
        get().setParam(`mat${slot}.src`, next[`mat${slot}.src`]);
        get().setParam(`mat${slot}.dst`, next[`mat${slot}.dst`]);
        get().setParam(`mat${slot}.amt`, next[`mat${slot}.amt`]);
      },

      updateSlot: (slot, patch) => {
        if (patch.src !== undefined) get().setParam(`mat${slot}.src`, patch.src);
        if (patch.dst !== undefined) get().setParam(`mat${slot}.dst`, patch.dst);
        if (patch.amt !== undefined) get().setParam(`mat${slot}.amt`, patch.amt);
        if (patch.pol !== undefined) get().setParam(`mat${slot}.pol`, patch.pol);
        if (patch.aux !== undefined) get().setParam(`mat${slot}.aux`, patch.aux);
      },

      clearSlot: (slot) => {
        const next = { ...get().params };
        clearSlotIn(next, slot);
        for (const k of ['src', 'dst', 'amt', 'pol', 'aux']) get().setParam(`mat${slot}.${k}`, next[`mat${slot}.${k}`]);
      },

      setModDrag: (src) => set({ modDrag: src }),
      setModFocus: (src) => set({ modFocus: src }),

      applyPreset: (presetParams, presetMods) => {
        replaceParams(resolvePresetMods(presetParams, presetMods), false);
      },

      loadPresetByValue: (val) => {
        const preset = val[0] === 'f' ? FACTORY_PRESETS[+val.slice(1)] : get().userPresets[+val.slice(1)];
        if (!preset) return;
        // A preset is self-describing: if it carries user tables, they become the
        // active pool so the table indices in its params resolve deterministically.
        if (preset.tables && preset.tables.length) setPool(preset.tables.map(deserializeUserTable));
        get().applyPreset(preset.params, preset.mods);
        set({ presetValue: val });
      },

      stepPreset: (d) => {
        const opts = presetOptions(get().userPresets);
        let i = opts.findIndex((o) => o.value === get().presetValue);
        if (i < 0) i = d > 0 ? -1 : 0;
        i = (i + d + opts.length) % opts.length;
        get().loadPresetByValue(opts[i].value);
      },

      savePreset: (name) => {
        // Embed the current user-table pool so the preset is portable on its own.
        const tables = get().userTables.map(serializeUserTable);
        const saved = saveUserPreset(name, get().params, tables);
        const opts = presetOptions(saved);
        // USER only: a factory preset with the same name sorts first in opts.
        const found = opts.find((o) => o.group === 'USER' && o.name === name);
        set({ userPresets: saved, presetValue: found ? found.value : get().presetValue, dirty: false });
      },

      captureSound: () => {
        const { presetValue, params, dirty, userTables: pool } = get();
        return { presetValue, params: { ...params }, dirty, userTables: pool };
      },

      restoreSound: (snap) => {
        if (snap.userTables !== get().userTables) setPool(snap.userTables);
        replaceParams({ ...snap.params }, snap.dirty);
        set({ presetValue: snap.presetValue });
      },

      applyVariant: (params) => replaceParams({ ...params }, true),

      addUserTable: (u) => {
        const pool = [...get().userTables, u];
        setPool(pool);
        const osc = get().editorOsc;
        if (osc) get().setParam(`${osc}.table`, TABLE_NAMES.length + pool.length - 1);
      },

      deleteUserTable: (poolIndex) => {
        setPool(get().userTables.filter((_, i) => i !== poolIndex));
        // Repair osc table references around the removed slot.
        const removed = TABLE_NAMES.length + poolIndex;
        for (const id of ['oscA.table', 'oscB.table']) {
          const v = get().params[id] | 0;
          if (v === removed) get().setParam(id, 0);
          else if (v > removed) get().setParam(id, v - 1);
        }
      },

      renameUserTable: (poolIndex, name) => {
        const nm = (name.trim().toUpperCase() || 'USER').slice(0, 14);
        const pool = get().userTables.map((t, i) => (i === poolIndex ? { ...t, name: nm } : t));
        saveUserTablePool(pool);
        set({ userTables: pool });
      },

      // In-place replace of an existing user table's waveform (and name), keeping
      // its pool index, so osc references to that table stay valid.
      updateUserTable: (poolIndex, u) => {
        if (poolIndex < 0 || poolIndex >= get().userTables.length) return;
        setPool(get().userTables.map((t, i) => (i === poolIndex ? u : t)));
      },

      duplicateUserTable: (poolIndex) => {
        const src = get().userTables[poolIndex];
        if (!src) return;
        const frames: Float32Array[] = [];
        for (let f = 0; f < src.frames; f++) frames.push(src.wave.slice(f * SIZE, (f + 1) * SIZE));
        get().addUserTable(makeUserTable((src.name + ' COPY').slice(0, 14), frames));
      },

      duplicateFactoryTable: (factoryIndex) => {
        const ft = factoryTables()[factoryIndex];
        if (!ft) return;
        get().addUserTable(makeUserTable((ft.name + ' COPY').slice(0, 14), framesFromGenerated(ft)));
      },

      openEditor: (osc) => set({ editorOsc: osc }),
      closeEditor: () => set({ editorOsc: null }),

      playNote: (n, vel) => {
        if (vel > 0) engine.noteOn(n, vel);
        else engine.noteOff(n);
        get().setActive(n, vel > 0);
      },

      setActive: (note, on) => {
        set((s) => {
          if (on === s.activeNotes.has(note)) return s;
          const next = new Set(s.activeNotes);
          if (on) next.add(note); else next.delete(note);
          return { activeNotes: next };
        });
      },

      panic: () => {
        engine.panic();
        set({ activeNotes: new Set() });
      },

      bend: (semis) => engine.bend(semis),
      setOctave: (o) => set({ octave: o }),
      setMidiActive: (on) => set({ midiActive: on }),

      dispose: () => {
        for (const n of get().activeNotes) engine.noteOff(n);
        unsubscribers.forEach((off) => off());
        engine.attach(null);
      },
    };
  });
}

// A detached store for shared widgets rendered outside a WT-1 editor (BL-1 and
// DR-1 reuse the control menu): reads work, nothing is committed anywhere.
let detached: Wt1StoreApi | null = null;
function detachedStore(): Wt1StoreApi {
  if (!detached) detached = createWt1Store();
  return detached;
}

const Wt1StoreContext = createContext<Wt1StoreApi | null>(null);

export function Wt1StoreProvider({ store, children }: { store: Wt1StoreApi; children: ReactNode }) {
  return createElement(Wt1StoreContext.Provider, { value: store }, children);
}

/** The editor's store API, for event handlers that read the latest state. */
export function useStoreApi(): Wt1StoreApi {
  return useContext(Wt1StoreContext) ?? detachedStore();
}

/** Select from the nearest WT-1 editor's store. */
export function useStore<T>(selector: (state: SynthStore) => T): T {
  return useZustandStore(useStoreApi(), selector);
}
