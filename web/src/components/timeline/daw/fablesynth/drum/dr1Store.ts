// Per-instance DR-1 editor store, one per timeline drum track (replaces the
// singleton `store.ts` for the timeline). Edits go to the live device at once
// and to the track's instrument through the host, which owns undo batching.
// The timeline's midi clips sequence the kit, so there is no step sequencer.

import { createContext, createElement, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { ParamValues } from '../params';
import { FACTORY_KITS, kitToState, loadUserKits, saveUserKit, stateToKit, type Kit } from './kits';
import {
  FACTORY_PATCHES, PATCH_FIELDS, applyPatchToParams, extractPatch, loadUserPatches,
  patchOptions, saveUserPatch, type PadPatch,
} from './patches';
import { pad } from './params';
import { makeEmptyPatterns } from './seq';
import type { DrumAssets } from './engine/drumAssets';
import type { Dr1Device } from '../../devices/dr1Device';

/** What the store needs from the track it edits. */
export interface Dr1StoreHost {
  /** Write the full record and pad names to the track's instrument. */
  write: (params: ParamValues, padNames: string[]) => void;
  /** Open one undo entry for a drag; writes until `endGesture` join it. */
  beginGesture: () => void;
  endGesture: () => void;
}

export interface KitOption {
  value: string;
  name: string;
  group: 'FACTORY' | 'USER';
}

export function kitOptions(userKits: Kit[]): KitOption[] {
  const options: KitOption[] = FACTORY_KITS.map((kit, i) => ({ value: `f${i}`, name: kit.name, group: 'FACTORY' as const }));
  userKits.forEach((kit, i) => options.push({ value: `u${i}`, name: kit.name, group: 'USER' }));
  return options;
}

/** What a kit load changes, for the kit browser's revert and A/B. */
export interface KitSnapshot {
  value: string;
  dirty: boolean;
  params: ParamValues;
  padNames: string[];
  patchValue: string;
}

/** One pad's patch fields as absolute ids, tied to the pad it was captured from. */
export interface PadSnapshot {
  value: string;
  dirty: boolean;
  pad: number;
  fields: Record<string, number>;
}

export interface DrumStore {
  params: ParamValues;
  padNames: string[];
  sel: number;
  hitTick: Record<number, number>;
  /** True once the track's live device is running. */
  powered: boolean;
  device: Dr1Device | null;
  assets: DrumAssets | null;
  /** The track's channel analyser, for the scope and the kit spectrum. */
  analyser: AnalyserNode | null;
  /** The timeline is playing: auditions would collide with the clips. */
  playing: boolean;
  kitValue: string;
  kitDirty: boolean;
  userKits: Kit[];
  patchValue: string;
  userPatches: PadPatch[];
  browser: 'kit' | 'patch' | null;
  modPosA: number;
  modPosB: number;
  envLevel: number;

  setParam: (id: string, v: number) => void;
  /** Several params as one edit. */
  setParams: (entries: Record<string, number>) => void;
  beginGesture: () => void;
  endGesture: () => void;
  selectPad: (i: number) => void;
  triggerPad: (i: number, vel: number) => void;
  setPadName: (i: number, name: string) => void;
  setBrowser: (which: 'kit' | 'patch' | null) => void;
  loadKitByValue: (value: string) => void;
  stepKit: (delta: number) => void;
  saveKit: (name: string) => void;
  captureKit: () => KitSnapshot;
  restoreKit: (snap: KitSnapshot) => void;
  applyPatchByValue: (value: string) => void;
  stepPatch: (delta: number) => void;
  savePatch: (name: string) => void;
  capturePad: () => PadSnapshot;
  restorePad: (snap: PadSnapshot) => void;
  applyPadVariant: (entries: Record<string, number>) => void;
  /** Adopt the track's instrument after an outside change (undo, another editor). */
  syncFromTrack: (params: ParamValues, padNames: string[]) => void;
  attach: (patch: Partial<Pick<DrumStore, 'device' | 'assets' | 'analyser' | 'playing'>>) => void;
}

export type DrumStoreApi = StoreApi<DrumStore>;

let factoryKitStates: Array<{ params: ParamValues; padNames: string[] }> | null = null;

/** The factory kit `params` and `padNames` are, as `f<i>`, or ''. */
function matchFactoryKit(params: ParamValues, padNames: string[]): string {
  factoryKitStates ??= FACTORY_KITS.map((kit) => kitToState(kit));
  const index = factoryKitStates.findIndex((kit) =>
    kit.padNames.every((name, i) => name === padNames[i]) &&
    Object.keys(kit.params).every((id) => id === 'seq.bpm' || kit.params[id] === params[id]));
  return index >= 0 ? `f${index}` : '';
}

export function createDrumStore(host: Dr1StoreHost, params: ParamValues, padNames: string[]): DrumStoreApi {
  return createStore<DrumStore>((set, get) => {
    const write = (nextParams: ParamValues, nextNames: string[]) => host.write(nextParams, nextNames);
    // Send to the device first so a drag is heard without waiting for the document.
    const apply = (entries: Record<string, number>, extra: Partial<DrumStore> = {}) => {
      const device = get().device;
      const next = { ...get().params };
      for (const [id, v] of Object.entries(entries)) {
        if (!Number.isFinite(v)) continue;
        next[id] = v;
        device?.setParam(id, v);
      }
      set({ params: next, kitDirty: true, ...extra });
      write(next, get().padNames);
    };
    const loadWhole = (nextParams: ParamValues, nextNames: string[], extra: Partial<DrumStore>) => {
      const device = get().device;
      if (device) for (const [id, v] of Object.entries(nextParams)) if (device.params[id] !== v) device.setParam(id, v);
      set({ params: nextParams, padNames: nextNames, ...extra });
      write(nextParams, nextNames);
    };

    return {
      params,
      padNames,
      sel: 0,
      hitTick: {},
      powered: false,
      device: null,
      assets: null,
      analyser: null,
      playing: false,
      kitValue: matchFactoryKit(params, padNames),
      kitDirty: false,
      userKits: loadUserKits(),
      patchValue: '',
      userPatches: loadUserPatches(),
      browser: null,
      modPosA: -1,
      modPosB: -1,
      envLevel: 0,

      setParam: (id, v) => apply({ [id]: v }),
      setParams: (entries) => apply(entries),
      beginGesture: () => host.beginGesture(),
      endGesture: () => host.endGesture(),

      selectPad: (i) => {
        get().device?.selectPad(i);
        set({ sel: i, patchValue: '' });
        get().triggerPad(i, 0.8);
      },
      triggerPad: (i, vel) => {
        const device = get().device;
        if (device) device.triggerPad(i, vel);
        else set((state) => ({ hitTick: { ...state.hitTick, [i]: performance.now() } }));
      },
      setPadName: (i, name) => {
        const padNames = get().padNames.slice();
        padNames[i] = name.toUpperCase().slice(0, 14);
        set({ padNames, kitDirty: true });
        write(get().params, padNames);
      },
      setBrowser: (which) => set({ browser: which }),

      loadKitByValue: (value) => {
        const kit = value[0] === 'f' ? FACTORY_KITS[Number(value.slice(1))] : get().userKits[Number(value.slice(1))];
        if (!kit) return;
        const state = kitToState(kit);
        loadWhole(state.params, state.padNames, { kitValue: value, patchValue: '', kitDirty: false });
      },
      stepKit: (delta) => {
        const options = kitOptions(get().userKits);
        let index = options.findIndex((option) => option.value === get().kitValue);
        if (index < 0) index = delta > 0 ? -1 : 0;
        get().loadKitByValue(options[(index + delta + options.length) % options.length].value);
      },
      saveKit: (name) => {
        const st = get();
        const kit = stateToKit(name, st.params, st.padNames, makeEmptyPatterns(), [0]);
        const userKits = saveUserKit(name, kit);
        const savedIndex = userKits.findIndex((entry) => entry.name === name);
        set({ userKits, kitValue: savedIndex >= 0 ? `u${savedIndex}` : st.kitValue, kitDirty: false });
      },
      captureKit: () => {
        const st = get();
        return { value: st.kitValue, dirty: st.kitDirty, params: { ...st.params }, padNames: [...st.padNames], patchValue: st.patchValue };
      },
      restoreKit: (snap) => loadWhole({ ...snap.params }, [...snap.padNames], {
        kitValue: snap.value, patchValue: snap.patchValue, kitDirty: snap.dirty,
      }),

      applyPatchByValue: (value) => {
        const patch = value[0] === 'f' ? FACTORY_PATCHES[Number(value.slice(1))] : get().userPatches[Number(value.slice(1))];
        if (!patch) return;
        apply(applyPatchToParams(get().params, get().sel, patch), { patchValue: value });
      },
      stepPatch: (delta) => {
        const options = patchOptions(get().userPatches);
        let index = options.findIndex((option) => option.value === get().patchValue);
        index = index < 0 ? (delta > 0 ? 0 : options.length - 1) : (index + delta + options.length) % options.length;
        get().applyPatchByValue(options[index].value);
      },
      savePatch: (name) => {
        const st = get();
        const userPatches = saveUserPatch(name, extractPatch(st.params, st.sel, name));
        const savedIndex = userPatches.findIndex((entry) => entry.name === name);
        set({ userPatches, patchValue: savedIndex >= 0 ? `u${savedIndex}` : st.patchValue });
      },
      capturePad: () => {
        const st = get();
        const fields: Record<string, number> = {};
        for (const f of PATCH_FIELDS) fields[pad(st.sel, f)] = st.params[pad(st.sel, f)];
        return { value: st.patchValue, dirty: st.kitDirty, pad: st.sel, fields };
      },
      restorePad: (snap) => {
        apply(snap.fields);
        set((st) => ({ patchValue: st.sel === snap.pad ? snap.value : st.patchValue, kitDirty: snap.dirty }));
      },
      applyPadVariant: (entries) => apply(entries),

      syncFromTrack: (nextParams, nextNames) => set({ params: nextParams, padNames: nextNames }),
      attach: (patch) => {
        set({ ...patch, ...(patch.device !== undefined ? { powered: !!patch.device } : {}) });
        if (patch.device) patch.device.selectPad(get().sel);
      },
    };
  });
}


const DrumStoreContext = createContext<DrumStoreApi | null>(null);

export function DrumStoreProvider({ store, children }: { store: DrumStoreApi; children: ReactNode }) {
  return createElement(DrumStoreContext.Provider, { value: store }, children);
}

export function useDrumStoreApi(): DrumStoreApi {
  const store = useContext(DrumStoreContext);
  if (!store) throw new Error('DR-1 components need a DrumStoreProvider');
  return store;
}

export function useDrumStore<T>(selector: (state: DrumStore) => T): T {
  return useStore(useDrumStoreApi(), selector);
}
