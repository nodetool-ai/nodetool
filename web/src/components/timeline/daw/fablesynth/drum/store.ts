// Zustand store for DR-1. Parameter and sequencer state live here and every
// mutation is mirrored to the imperative audio engine.

import { create } from 'zustand';
import type { ParamValues } from '../params';
import {
  deserializeUserTable,
  framesFromGenerated,
  makeUserTable,
  serializeUserTable,
} from '../engine/usertables';
import type { GeneratedTable } from '../engine/wavetables';
import { DrumEngine } from './engine/drum-synth';
import { FACTORY_KITS, PATTERN_PRESETS, kitToState, loadUserKits, saveUserKit, stateToKit, type Kit } from './kits';
import {
  FACTORY_PATCHES, PATCH_FIELDS, applyPatchToParams, extractPatch, loadUserPatches,
  patchOptions, saveUserPatch, type PadPatch,
} from './patches';
import { DRUM_TABLE_NAMES, PAD_COUNT, pad } from './params';
import {
  cycleStep, NPATTERNS, patIdx, randomizePadPattern, STEPS, type Patterns,
} from './seq';
import { sequenceChain, sequenceLengthFromChain } from '../sequenceLength';
import { compileAutomation, copyAutomation, validateAutomation, type AutoLane } from '../seq/clipAutomation';
import { cloneDrumSequence, drumSourceConflict, updateDrumLane, type DrumRhythm, type DrumLaneRhythm, type DrumSequence } from './rhythm';
import {
  clearPadRect, copyPadRect, copyPattern, makeHistory, movePadRect, padRectNorm, pastePadRect,
  pastePattern, type PadRectCells, type PadRectSel, type SeqLayout,
} from '../shared/seqEdit';

export type { PadRectSel } from '../shared/seqEdit';

export let drumEngine = new DrumEngine();
const initialKitState = kitToState(FACTORY_KITS[0]);

// Editor cells carry two bytes (hit, signed timing); a pad's
// row is a lane. One layout covers both the whole-pattern block ops
// (copyPattern/pastePattern span all pads) and the pad-rect ops (which compute
// the per-pad offset themselves from padCount = PAD_COUNT).
const DRUM_LAYOUT: SeqLayout = { stride: 2, stepsPerPattern: STEPS, patternSize: PAD_COUNT * STEPS * 2 };

// The editor carries hit + signed timing together through the existing cell
// operations. Playback and persisted pattern bytes retain their original layout.
function timingEditBytes(st: DrumSequence): Uint8Array {
  const bytes = new Uint8Array(2048);
  for (let bar = 0; bar < 4; bar++) for (let pad = 0; pad < 16; pad++) for (let step = 0; step < 16; step++) {
    const index = patIdx(bar, pad, step);
    bytes[index * 2] = st.patterns[index];
    bytes[index * 2 + 1] = (st.drumRhythm?.lanes[pad]?.stepDelayMs?.[bar * 16 + step] ?? 0) & 255;
  }
  return bytes;
}
function sequenceFromEditBytes(st: DrumSequence, bytes: Uint8Array): DrumSequence {
  const patterns = new Uint8Array(1024);
  let drumRhythm = st.drumRhythm;
  for (let pad = 0; pad < 16; pad++) {
    const offsets = [...(drumRhythm?.lanes[pad]?.stepDelayMs ?? [])];
    let changed = false;
    for (let bar = 0; bar < 4; bar++) for (let step = 0; step < 16; step++) {
      const index = patIdx(bar, pad, step), raw = bytes[index * 2 + 1];
      patterns[index] = bytes[index * 2];
      const delay = raw > 127 ? raw - 256 : raw;
      if (delay !== (offsets[bar * 16 + step] ?? 0)) {
        while (offsets.length <= bar * 16 + step) offsets.push(0);
        offsets[bar * 16 + step] = delay; changed = true;
      }
    }
    if (changed) drumRhythm = updateDrumLane(drumRhythm, pad, { stepDelayMs: offsets }, 0, 4);
  }
  return { patterns, chain: st.chain, drumRhythm };
}

export type DrumClipboard =
  | { kind: 'rect'; data: PadRectCells }
  | { kind: 'pattern'; data: Uint8Array }
  | null;

// Complete sequence history stays outside rendered state. Parameter edits are independent.
let sequenceGesture = false;
let gesturePushed = false;
// Snapshots carry the standalone automation lanes so undo restores them too.
type SequenceSnapshot = DrumSequence & { automation: AutoLane[] };
const patternHistory = makeHistory<SequenceSnapshot>();
const snapshot = (st: DrumSequence & { automation: AutoLane[] }): SequenceSnapshot =>
  ({ ...cloneDrumSequence(st), automation: copyAutomation(st.automation) });
// Standalone automation plays on the DR-1 transport; hosted clips own theirs.
function sendAutomation(st: DrumSequence & { automation: AutoLane[]; hosted: boolean }): void {
  if (!st.hosted) drumEngine.setSequenceAutomation(compileAutomation(st.automation, st.chain.length, st.drumRhythm, 'DR1'));
}

export interface KitOption {
  value: string;
  name: string;
  group: 'FACTORY' | 'USER';
}

export function kitOptions(userKits: Kit[]): KitOption[] {
  const options: KitOption[] = FACTORY_KITS.map((kit, i) => ({
    value: `f${i}`,
    name: kit.name,
    group: 'FACTORY' as const,
  }));
  userKits.forEach((kit, i) => options.push({ value: `u${i}`, name: kit.name, group: 'USER' }));
  return options;
}

/** What a kit load changes (patterns stay with the sequencer), for the browser. */
export interface KitSnapshot {
  value: string;
  dirty: boolean;
  params: ParamValues;
  padNames: string[];
  userTables: GeneratedTable[];
  patchValue: string;
}

/** The sequence a pattern load replaces, for the pattern browser. */
export interface PatternSnapshot {
  value: string;
  dirty: boolean;
  sequence: DrumSequence;
  editPattern: number;
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
  sel: number;
  patterns: Patterns;
  chain: number[];
  drumRhythm?: DrumRhythm;
  editPattern: number;
  playing: boolean;
  curStep: number;
  curPat: number;
  powered: boolean;
  hosted: boolean;
  midiActive: boolean;
  kitValue: string;
  userKits: Kit[];
  patchValue: string;
  userPatches: PadPatch[];
  padNames: string[];
  hitTick: Record<number, number>;
  mode: 'step' | 'pads';
  modPosA: number;
  modPosB: number;
  envLevel: number;
  userTables: GeneratedTable[];
  rectSel: PadRectSel | null;
  lastCell: { step: number; pad: number } | null;
  clipboard: DrumClipboard;
  kitDirty: boolean;
  /** The open preset-browser drawer; one at a time. */
  browser: 'kit' | 'patch' | 'pattern' | null;
  setBrowser: (which: 'kit' | 'patch' | 'pattern' | null) => void;
  /** Library value of the last pattern loaded from the pattern browser. */
  patternValue: string;
  /** Loads library patterns (kit and BPM unchanged); hosted clips keep their chain length. */
  loadPatterns: (patterns: Uint8Array, chain: number[], value?: string) => boolean;
  captureSequence: () => PatternSnapshot;
  restoreSequence: (snap: PatternSnapshot) => void;
  captureKit: () => KitSnapshot;
  restoreKit: (snap: KitSnapshot) => void;
  capturePad: () => PadSnapshot;
  restorePad: (snap: PadSnapshot) => void;
  /** Applies absolute pad-field values (a variant) and marks the kit dirty. */
  applyPadVariant: (entries: Record<string, number>) => void;

  sequenceContext: number;
  lanePositions: number[];
  sequenceError: string | null;
  selectLane: (pad: number) => void;
  commitSequence: (next: DrumSequence, history?: boolean) => boolean;
  /** Standalone sequence automation lanes (hosted clips keep theirs in SQ-4). */
  automation: AutoLane[];
  setAutomation: (lanes: AutoLane[], opts?: { history?: boolean }) => void;
  loadPatternPreset: (index: number) => boolean;
  setLaneEnabled: (pad: number, enabled: boolean) => void;
  updateLaneRhythm: (pad: number, patch: Partial<DrumLaneRhythm>) => void;
  setMicroDelay: (pad: number, value: number, step?: number) => void;
  toggleSourceCell: (pad: number, bar: number, step: number) => void;
  beginSequenceGesture: () => void;
  endSequenceGesture: () => void;
  setParam: (id: string, v: number) => void;
  selectPad: (i: number) => void;
  triggerPad: (i: number, vel: number) => void;
  _setPatterns: (next: Patterns) => void;
  _pushHistory: () => void;
  _clearHistory: () => void;
  // padI defaults to the selected pad; STEP mode's 16-lane view passes the
  // lane's own pad so a click never depends on selection order.
  toggleStep: (step: number, padI?: number) => void;
  randomizePad: () => void;
  setEditPattern: (i: number) => void;
  setSequenceLength: (length: number) => void;
  setRectSel: (sel: PadRectSel | null) => void;
  moveRectSel: (dStep: number, dPad: number, opts?: { copy?: boolean }) => void;
  dropRect: (data: PadRectCells, atStep: number, atPad: number, clearSrc?: PadRectSel | null) => void;
  selectAllSteps: () => void;
  clearStepSel: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  movePattern: (from: number, to: number, opts?: { copy?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  setMode: (mode: 'step' | 'pads') => void;
  setMidiActive: (on: boolean) => void;
  setPadName: (i: number, name: string) => void;
  play: () => void;
  stop: () => void;
  attachHosted: (engine: DrumEngine) => void;
  powerOn: () => Promise<void>;
  saveKit: (name: string) => void;
  loadKitByValue: (value: string) => void;
  stepKit: (delta: number) => void;
  applyPatchByValue: (value: string) => void;
  stepPatch: (delta: number) => void;
  savePatch: (name: string) => void;
  setParamsFromKit: (params: ParamValues) => void;
  importPadTable: (padI: number, table: GeneratedTable) => void;
}

export const useDrumStore = create<DrumStore>((set, get) => ({
  params: initialKitState.params,
  sel: 0,
  patterns: initialKitState.patterns,
  chain: sequenceChain(sequenceLengthFromChain(initialKitState.chain)),
  drumRhythm: initialKitState.drumRhythm,
  automation: [],
  editPattern: 0,
  playing: false,
  curStep: -1,
  curPat: 0,
  powered: false,
  hosted: false,
  midiActive: false,
  kitValue: 'f0',
  userKits: loadUserKits(),
  patchValue: '',
  userPatches: loadUserPatches(),
  padNames: initialKitState.padNames,
  hitTick: {},
  mode: 'step',
  modPosA: -1,
  modPosB: -1,
  envLevel: 0,
  userTables: [],
  rectSel: null,
  lastCell: null,
  clipboard: null,
  kitDirty: false,
  browser: null,
  patternValue: '',

  sequenceContext: 0,
  lanePositions: Array(16).fill(-1),
  sequenceError: null,
  selectLane: (i) => { drumEngine.selectPad(i); set({ sel: i, patchValue: '' }); },
  beginSequenceGesture: () => { sequenceGesture = true; gesturePushed = false; },
  endSequenceGesture: () => { sequenceGesture = false; gesturePushed = false; },
  commitSequence: (value, history = true) => {
    try {
      const conflict = get().hosted && drumSourceConflict(value.drumRhythm, value.chain.length, get().padNames);
      if (conflict) throw new Error(conflict);
      const next = cloneDrumSequence(value, get().hosted ? value.chain.length : 4);
      if (history) get()._pushHistory();
      set({ ...next, kitDirty: true, sequenceError: null });
      if (!get().hosted) {
        drumEngine.setSequence(next.patterns, next.chain, next.drumRhythm);
        sendAutomation(get());
      }
      return true;
    } catch (error) { set({ sequenceError: (error as Error).message }); return false; }
  },
  setAutomation: (lanes, opts = {}) => {
    if (get().hosted || validateAutomation(lanes, 'DR1')) return;
    if (opts.history !== false) get()._pushHistory();
    set({ automation: copyAutomation(lanes), kitDirty: true });
    sendAutomation(get());
  },
  loadPatternPreset: (index) => {
    const preset = PATTERN_PRESETS[index];
    return !!preset && get().loadPatterns(Uint8Array.from(preset.patterns), preset.chain);
  },
  loadPatterns: (patterns, chain, value = '') => {
    const loaded = get().commitSequence({
      patterns: Uint8Array.from(patterns),
      chain: get().hosted ? sequenceChain(chain.length) : [...chain],
      drumRhythm: undefined,
    });
    if (loaded) set({ editPattern: 0, rectSel: null, patternValue: value });
    return loaded;
  },
  captureSequence: () => {
    const st = get();
    return {
      value: st.patternValue, dirty: st.kitDirty, editPattern: st.editPattern,
      sequence: { patterns: st.patterns.slice(), chain: [...st.chain], ...(st.drumRhythm ? { drumRhythm: st.drumRhythm } : {}) },
    };
  },
  restoreSequence: (snap) => {
    if (get().commitSequence(snap.sequence, false)) set({ editPattern: snap.editPattern, patternValue: snap.value, kitDirty: snap.dirty, rectSel: null });
  },
  setMicroDelay: (pad, value, step) => {
    const st = get();
    const lane = st.drumRhythm?.lanes[pad];
    const patch: Partial<DrumLaneRhythm> = { enabled: lane?.enabled ?? false, ...(!lane ? { sourceBar: 0 } : {}) };
    if (step === undefined) patch.delayMs = value;
    else {
      if (!Number.isInteger(step) || step < 0 || step >= 16) return;
      const offsets = [...(lane?.stepDelayMs ?? [])];
      while (offsets.length <= st.editPattern * 16 + step) offsets.push(0);
      offsets[st.editPattern * 16 + step] = value;
      patch.stepDelayMs = offsets;
    }
    st.updateLaneRhythm(pad, patch);
  },
  setLaneEnabled: (i, enabled) => get().updateLaneRhythm(i, { enabled }),
  updateLaneRhythm: (i, patch) => {
    const st = get();
    try {
      const drumRhythm = updateDrumLane(st.drumRhythm, i,
        { enabled: true, ...patch }, 0, st.hosted ? st.chain.length : 4);
      st.commitSequence({ patterns: st.patterns, chain: st.chain, drumRhythm });
    } catch (error) { set({ sequenceError: (error as Error).message }); }
  },
  toggleSourceCell: (i, bar, step) => {
    const st = get();
    if (!Number.isInteger(bar) || bar < 0 || bar >= (st.hosted ? st.chain.length : 4) || step < 0 || step > 15) return;
    const patterns = st.patterns.slice();
    const index = patIdx(bar, i, step);
    patterns[index] = cycleStep(patterns[index]);
    st.commitSequence({ patterns, chain: st.chain, drumRhythm: st.drumRhythm });
  },
  setParam: (id, v) => {
    drumEngine.setParam(id, v);
    set((state) => ({ params: { ...state.params, [id]: v }, kitDirty: true }));
  },

  selectPad: (i) => {
    drumEngine.selectPad(i);
    drumEngine.trigger(i, 0.8);
    set((state) => ({ sel: i, patchValue: '', hitTick: { ...state.hitTick, [i]: performance.now() } }));
  },

  triggerPad: (i, vel) => {
    drumEngine.trigger(i, vel);
    set((state) => ({ hitTick: { ...state.hitTick, [i]: performance.now() } }));
  },

  // Every pattern mutation writes the store and pushes to the engine in one
  // place. (Patterns persist inside kits, not standalone — no localStorage.)
  _setPatterns(next: Patterns) {
    get().commitSequence(next.length === 2048 ? sequenceFromEditBytes(get(), next)
      : { patterns: next, chain: get().chain, drumRhythm: get().drumRhythm }, false);
  },

  // Bounded undo/redo (50 complete sequence snapshots). Every editing
  // verb — including plain step toggling — pushes the pre-mutation buffer
  // here first; knob/param changes never touch history.
  _pushHistory: () => {
    if (sequenceGesture && gesturePushed) return;
    patternHistory.push(snapshot(get()));
    if (sequenceGesture) gesturePushed = true;
  },
  _clearHistory: () => { patternHistory.clear(); sequenceGesture = false; gesturePushed = false; set({ sequenceError: null, sequenceContext: get().sequenceContext + 1 }); },

  toggleStep: (step, padI) => {
    const { patterns, editPattern, sel } = get();
    const targetPad = padI ?? sel;
    get()._pushHistory();
    const next = patterns.slice();
    const index = patIdx(editPattern, targetPad, step);
    next[index] = cycleStep(next[index]);
    // Anchor for a no-selection paste (mirrors WT-1's lastCell).
    set({ lastCell: { step, pad: targetPad } });
    get()._setPatterns(next);
  },

  // RAND button: rewrites the selected pad's row in the current edit
  // pattern only — other pads' lanes are untouched (mirrors BL-1's randomize,
  // scoped down to one lane since DR-1 has no per-step pitch/duration).
  randomizePad: () => {
    const { patterns, editPattern, sel } = get();
    get()._pushHistory();
    get()._setPatterns(randomizePadPattern(patterns, editPattern, sel));
  },

  setEditPattern: (i) => set({ editPattern: Math.max(0, Math.min(get().hosted ? get().chain.length - 1 : 3, i | 0)) }),

  setSequenceLength: (length) => {
    const chain = sequenceChain(length);
    get().commitSequence({ patterns: get().patterns, chain, drumRhythm: get().drumRhythm });
  },

  // Clamp a rectangle into the step × pad grid so the stored selection and any
  // pasted content always agree.
  setRectSel: (sel) => set({
    rectSel: sel
      ? {
          stepFrom: Math.min(STEPS - 1, Math.max(0, sel.stepFrom | 0)),
          stepTo: Math.min(STEPS - 1, Math.max(0, sel.stepTo | 0)),
          padFrom: Math.min(PAD_COUNT - 1, Math.max(0, sel.padFrom | 0)),
          padTo: Math.min(PAD_COUNT - 1, Math.max(0, sel.padTo | 0)),
        }
      : null,
  }),

  // Cmd-A: select the whole grid (every step of every pad in the edit pattern).
  selectAllSteps: () => set({ rectSel: { stepFrom: 0, stepTo: STEPS - 1, padFrom: 0, padTo: PAD_COUNT - 1 } }),

  clearStepSel: () => set({ rectSel: null }),

  // Copy/cut fall back to the whole edit pattern (all pads) when nothing is
  // selected; a rectangle scopes to its step × pad band.
  copySelection: () => {
    const patterns = timingEditBytes(get());
    const { editPattern, rectSel } = get();
    if (rectSel) {
      set({ clipboard: { kind: 'rect', data: copyPadRect(patterns, DRUM_LAYOUT, editPattern, rectSel) } });
    } else {
      set({ clipboard: { kind: 'pattern', data: copyPattern(patterns, DRUM_LAYOUT, editPattern) } });
    }
  },

  // Copy then clear exactly what copySelection captured (rectangle, or the
  // whole edit pattern as fallback).
  cutSelection: () => {
    const patterns = timingEditBytes(get());
    get().copySelection();
    const { editPattern, rectSel } = get();
    get()._pushHistory();
    if (rectSel) {
      get()._setPatterns(clearPadRect(patterns, DRUM_LAYOUT, editPattern, rectSel));
    } else {
      get()._setPatterns(pastePattern(patterns, DRUM_LAYOUT, editPattern, new Uint8Array(PAD_COUNT * STEPS * 2)));
    }
  },

  // Distinct from cut: only clears an active selection, never the whole
  // pattern as an implicit fallback (Delete/Backspace with nothing selected
  // is a no-op, unlike Cmd/Ctrl-X).
  deleteSelection: () => {
    const patterns = timingEditBytes(get());
    const { editPattern, rectSel } = get();
    if (!rectSel) return;
    get()._pushHistory();
    get()._setPatterns(clearPadRect(patterns, DRUM_LAYOUT, editPattern, rectSel));
  },

  // Rectangle payloads anchor at the current rect's top-left, else the
  // last-touched cell, else the grid origin; whole-pattern payloads always
  // land on the current edit pattern (all pads). Selection follows the paste.
  pasteSelection: () => {
    const patterns = timingEditBytes(get());
    const { clipboard, editPattern, rectSel, lastCell } = get();
    if (!clipboard) return;
    get()._pushHistory();
    if (clipboard.kind === 'pattern') {
      get()._setPatterns(pastePattern(patterns, DRUM_LAYOUT, editPattern, clipboard.data));
      return;
    }
    const anchor = rectSel
      ? { step: padRectNorm(rectSel).stepLo, pad: padRectNorm(rectSel).padLo }
      : lastCell ?? { step: 0, pad: 0 };
    get()._setPatterns(pastePadRect(patterns, DRUM_LAYOUT, editPattern, anchor.step, anchor.pad, clipboard.data, PAD_COUNT));
    get().setRectSel({
      stepFrom: anchor.step,
      stepTo: anchor.step + clipboard.data.wSteps - 1,
      padFrom: anchor.pad,
      padTo: anchor.pad + clipboard.data.wPads - 1,
    });
  },

  // With a rectangle selected: paste a copy immediately to its right at the
  // same pads (dropped if it runs off the pattern), and reselect the copy.
  // With no selection: duplicate the current bar into the next one, extending
  // the sequence length if needed.
  duplicateSelection: () => {
    const patterns = timingEditBytes(get());
    const { editPattern, rectSel } = get();
    if (rectSel) {
      const { stepLo, stepHi, padLo, padHi } = padRectNorm(rectSel);
      const at = stepHi + 1;
      if (at >= STEPS) return; // nothing past the last step — no-op
      get()._pushHistory();
      const data = copyPadRect(patterns, DRUM_LAYOUT, editPattern, rectSel);
      get()._setPatterns(pastePadRect(patterns, DRUM_LAYOUT, editPattern, at, padLo, data, PAD_COUNT));
      get().setRectSel({ stepFrom: at, stepTo: at + (stepHi - stepLo), padFrom: padLo, padTo: padHi });
      return;
    }
    const nextPat = Math.min(NPATTERNS - 1, editPattern + 1);
    if (nextPat === editPattern) return; // already the last bar
    get()._pushHistory();
    const data = copyPattern(patterns, DRUM_LAYOUT, editPattern);
    get().commitSequence({ ...sequenceFromEditBytes(get(), pastePattern(patterns, DRUM_LAYOUT, nextPat, data)),
      chain: get().chain.length <= nextPat ? sequenceChain(nextPat + 1) : get().chain }, false);
    set({ editPattern: nextPat, rectSel: null });
  },

  // In-rect drag: move (or Alt-copy) the whole block by (dStep, dPad), clamped
  // so the rectangle stays inside the grid. One undo entry.
  moveRectSel: (dStep, dPad, opts = {}) => {
    const patterns = timingEditBytes(get());
    const { editPattern, rectSel } = get();
    if (!rectSel) return;
    const { stepLo, stepHi, padLo, padHi } = padRectNorm(rectSel);
    const ds = Math.min(STEPS - 1 - stepHi, Math.max(-stepLo, dStep | 0));
    const dp = Math.min(PAD_COUNT - 1 - padHi, Math.max(-padLo, dPad | 0));
    if (ds === 0 && dp === 0) return;
    get()._pushHistory();
    get()._setPatterns(movePadRect(patterns, DRUM_LAYOUT, editPattern, rectSel, ds, dp, PAD_COUNT, { copy: opts.copy }));
    set({ rectSel: { stepFrom: stepLo + ds, stepTo: stepHi + ds, padFrom: padLo + dp, padTo: padHi + dp } });
  },

  // Ghost-paste drop (menu CUT/COPY → drop on click): stamp the carried cells
  // with their top-left at (atStep, atPad); a CUT clears its source in the same
  // undo entry as the paste. Selection follows the dropped block.
  dropRect: (data, atStep, atPad, clearSrc) => {
    const patterns = timingEditBytes(get());
    if (!data.cells.length) return;
    const { editPattern } = get();
    get()._pushHistory();
    const base = clearSrc ? clearPadRect(patterns, DRUM_LAYOUT, editPattern, clearSrc) : patterns;
    get()._setPatterns(pastePadRect(base, DRUM_LAYOUT, editPattern, atStep, atPad, data, PAD_COUNT));
    get().setRectSel({
      stepFrom: atStep,
      stepTo: atStep + data.wSteps - 1,
      padFrom: atPad,
      padTo: atPad + data.wPads - 1,
    });
  },

  // Bar-chip drag on SequenceLengthControl: move = swap patterns `from`/`to`
  // (all pads); Alt held = copy `from` over `to`, leaving `from` untouched.
  movePattern: (from, to, opts = {}) => {
    const patterns = timingEditBytes(get());
    if (from === to) return;
    const dataFrom = copyPattern(patterns, DRUM_LAYOUT, from);
    get()._pushHistory();
    if (opts.copy) {
      get()._setPatterns(pastePattern(patterns, DRUM_LAYOUT, to, dataFrom));
      return;
    }
    const dataTo = copyPattern(patterns, DRUM_LAYOUT, to);
    const next = pastePattern(pastePattern(patterns, DRUM_LAYOUT, to, dataFrom), DRUM_LAYOUT, from, dataTo);
    get()._setPatterns(next);
  },

  undo: () => {
    const restored = patternHistory.undo(snapshot(get()));
    if (restored && get().commitSequence(restored, false)) {
      set({ automation: restored.automation });
      sendAutomation(get());
    }
  },

  redo: () => {
    const restored = patternHistory.redo(snapshot(get()));
    if (restored && get().commitSequence(restored, false)) {
      set({ automation: restored.automation });
      sendAutomation(get());
    }
  },

  setMode: (mode) => set({ mode }),
  setMidiActive: (on) => set({ midiActive: on }),

  setPadName: (i, name) => set((state) => {
    const padNames = state.padNames.slice();
    padNames[i] = name.toUpperCase().slice(0, 14);
    return { padNames, kitDirty: true };
  }),

  play: () => {
    if (get().hosted) return;
    drumEngine.play();
    set({ playing: true });
  },

  stop: () => {
    if (get().hosted) return;
    drumEngine.stop();
    set({ playing: false, curStep: -1 });
  },

  // SQ-4 hosted mode: adopt the rig's running engine. The conductor owns the
  // transport and the clip owns the patterns; this store keeps patch editing.
  attachHosted: (engine) => {
    drumEngine = engine;
    // The conductor drives the engine from the SQ-4 clip, so onstep never
    // fires here — flash pad LEDs from the hosted step's reported hits.
    engine.onhit = (pads) => set((state) => {
      const hitTick = { ...state.hitTick };
      const now = performance.now();
      pads.forEach((p) => { hitTick[p] = now; });
      return { hitTick };
    });
    set({
      hosted: true,
      powered: true,
      playing: false,
      curStep: -1,
      params: { ...engine.params },
    });
  },

  powerOn: async () => {
    await drumEngine.init();
    const userTables = get().userTables;
    if (userTables.length) drumEngine.setUserTables(userTables);
    drumEngine.onlanepos = (lanePositions) => set({ lanePositions });
    drumEngine.onstep = (data) => set((state) => {
      const hitTick = { ...state.hitTick };
      const now = performance.now();
      data.hits.forEach((hit) => { hitTick[hit] = now; });
      return { curStep: data.s, curPat: data.pat, hitTick };
    });
    drumEngine.onviz = (data) => set({ modPosA: data.a, modPosB: data.b, envLevel: data.env });
    drumEngine.params = { ...get().params };
    drumEngine.applyAllParams();
    drumEngine.setSequence(get().patterns, get().chain, get().drumRhythm);
    sendAutomation(get());
    set({ powered: true });
  },

  saveKit: (name) => {
    const state = get();
    const tables = state.userTables.map((table) =>
      serializeUserTable(makeUserTable(table.name, framesFromGenerated(table))));
    const kit = stateToKit(name, state.params, state.padNames, state.patterns, state.chain, tables, state.drumRhythm);
    const userKits = saveUserKit(name, kit);
    const savedIndex = userKits.findIndex((entry) => entry.name === name);
    set({ userKits, kitValue: savedIndex >= 0 ? `u${savedIndex}` : state.kitValue, kitDirty: false });
  },

  loadKitByValue: (value) => {
    const kit = value[0] === 'f'
      ? FACTORY_KITS[Number(value.slice(1))]
      : get().userKits[Number(value.slice(1))];
    if (!kit) return;

    const state = kitToState(kit);
    // Kit presets are sound banks. Keep transport tempo in the sequencer.
    state.params['seq.bpm'] = get().params['seq.bpm'];
    if (get().hosted) {
      // Hosted: a kit is a sound, not a song — params only, clip keeps its pattern.
      const userTables = state.tables.map((table) => deserializeUserTable(table).table);
      drumEngine.panic(true);
      drumEngine.setUserTables(userTables);
      drumEngine.params = { ...state.params };
      drumEngine.applyAllParams();
      set({
        params: state.params, padNames: state.padNames, userTables, kitValue: value,
        patchValue: '', kitDirty: false,
      });
      return;
    }
    const userTables = state.tables.map((table) => deserializeUserTable(table).table);
    drumEngine.panic();
    drumEngine.setUserTables(userTables);
    drumEngine.params = { ...state.params };
    drumEngine.applyAllParams();
    set({
      params: state.params,
      padNames: state.padNames,
      userTables,
      kitValue: value,
      patchValue: '',
      kitDirty: false,
    });
  },

  setBrowser: (which) => set({ browser: which }),

  captureKit: () => {
    const st = get();
    return {
      value: st.kitValue, dirty: st.kitDirty, params: { ...st.params }, padNames: [...st.padNames],
      userTables: [...st.userTables], patchValue: st.patchValue,
    };
  },

  restoreKit: (snap) => {
    const params = { ...snap.params };
    drumEngine.panic(get().hosted);
    drumEngine.setUserTables(snap.userTables);
    drumEngine.params = { ...params };
    drumEngine.applyAllParams();
    set({
      params, padNames: [...snap.padNames], userTables: [...snap.userTables],
      kitValue: snap.value, patchValue: snap.patchValue, kitDirty: snap.dirty,
    });
  },

  capturePad: () => {
    const st = get();
    const fields: Record<string, number> = {};
    for (const f of PATCH_FIELDS) fields[pad(st.sel, f)] = st.params[pad(st.sel, f)];
    return { value: st.patchValue, dirty: st.kitDirty, pad: st.sel, fields };
  },

  restorePad: (snap) => {
    for (const [id, v] of Object.entries(snap.fields)) get().setParam(id, v);
    // patchValue names the selected pad's patch; leave it if the selection moved.
    set((st) => ({ patchValue: st.sel === snap.pad ? snap.value : st.patchValue, kitDirty: snap.dirty }));
  },

  applyPadVariant: (entries) => {
    for (const [id, v] of Object.entries(entries)) get().setParam(id, v);
  },

  stepKit: (delta) => {
    const options = kitOptions(get().userKits);
    if (!options.length) return;
    let index = options.findIndex((option) => option.value === get().kitValue);
    if (index < 0) index = 0;
    index = (index + delta + options.length) % options.length;
    get().loadKitByValue(options[index].value);
  },

  applyPatchByValue: (value) => {
    const patch = value[0] === 'f'
      ? FACTORY_PATCHES[Number(value.slice(1))]
      : get().userPatches[Number(value.slice(1))];
    if (!patch) return;
    const entries = applyPatchToParams(get().params, get().sel, patch);
    for (const [id, v] of Object.entries(entries)) get().setParam(id, v);
    set({ patchValue: value });
  },

  stepPatch: (delta) => {
    const options = patchOptions(get().userPatches);
    if (!options.length) return;
    let index = options.findIndex((option) => option.value === get().patchValue);
    index = index < 0
      ? (delta > 0 ? 0 : options.length - 1)
      : (index + delta + options.length) % options.length;
    get().applyPatchByValue(options[index].value);
  },

  savePatch: (name) => {
    const state = get();
    const patch = extractPatch(state.params, state.sel, name);
    const userPatches = saveUserPatch(name, patch);
    const savedIndex = userPatches.findIndex((entry) => entry.name === name);
    set({ userPatches, patchValue: savedIndex >= 0 ? `u${savedIndex}` : state.patchValue });
  },

  setParamsFromKit: (params) => {
    drumEngine.panic(get().hosted);
    drumEngine.params = { ...params };
    drumEngine.applyAllParams();
    set({ params: { ...params } });
  },

  importPadTable: (padI, table) => {
    const userTables = [...get().userTables, table];
    drumEngine.setUserTables(userTables);
    set({ userTables });
    get().setParam(pad(padI, 'oscA.table'), DRUM_TABLE_NAMES.length + userTables.length - 1);
  },
}));
