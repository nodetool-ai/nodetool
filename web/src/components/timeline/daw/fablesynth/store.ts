import { copySequenceRhythm, updateSequenceRhythm, type SequenceRhythm } from './shared/sequenceRhythm';
import { compileAutomation, copyAutomation, validateAutomation, type AutoLane } from './seq/clipAutomation';
// Zustand store — single source of truth for parameter values and transport
// state. Mirrors the imperative `engine.params` + control-registry wiring of the
// original vanilla build: every control reads its value from here and writes
// back through `setParam`, which also forwards to the audio engine.

import { create } from 'zustand';
import { NOTE_PATTERN_PRESETS, notePresetSequence } from './patternPresets';
import { arpCompile, loadArp, type ArpState } from './arp';
import { scaleMap } from './scales';
import { SynthEngine } from './engine/synth';
import { feedModLive } from './engine/modLive';
import { defaultParams, TABLE_NAMES, type ModConnection, type ParamValues } from './params';
import { FACTORY_PRESETS, loadUserPresets, resolvePresetMods, saveUserPreset, type Preset } from './presets';
import { findFreeSlot, setMatSlot, clearSlot as clearSlotIn, MOD_DEFAULT_AMT } from './store/slotHelpers';
import {
  loadUserTablePool, saveUserTablePool, serializeUserTable, deserializeUserTable,
  makeUserTable, framesFromGenerated, type UserTable,
} from './engine/usertables';
import {
  cycleOct, EMPTY_STEP, getStep, loadSeqState, NOTE_LANES, NPATTERNS, randomPattern, saveSeqState, setStep,
  STEPS, WT1_LAYOUT, writePattern, type Patterns,
} from './noteseq';
import { generateTables, SIZE, type GeneratedTable } from './engine/wavetables';
import { sequenceChain, sequenceLengthFromChain } from './sequenceLength';
import {
  clearRange, clearRectChain, copyPattern, copyRectChain, makeHistory, moveRectChain, pastePattern,
  pasteRectChain, rectNorm, type RectCells, type RectSel,
} from './shared/seqEdit';

// Singleton audio engine (created once, initialized on power-on).
export let engine = new SynthEngine();

export interface PresetOption {
  value: string; // 'f<i>' factory | 'u<i>' user
  name: string;
  group: 'FACTORY' | 'USER';
}

export type { RectSel } from './shared/seqEdit';
export type SeqClipboard =
  | { kind: 'rect'; data: RectCells }
  | { kind: 'pattern'; data: Uint8Array }
  | null;

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

interface SynthStore {
  arp: ArpState;
  arpMode: boolean;
  arpKeys: number[];
  setArpMode: (on: boolean) => void;
  updateArp: (patch: Partial<ArpState>) => void;
  clearArpKeys: () => void;
  params: ParamValues;
  modDrag: number; // source being dragged (MOD_SOURCES index), 0 = none
  modFocus: number; // source chip under the pointer; its rings light up, 0 = none
  powered: boolean;
  hosted: boolean;
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

  // note sequencer
  sequenceRhythm: SequenceRhythm;
  updateSequenceRhythm: (patch: Partial<SequenceRhythm>) => void;
  patterns: Patterns;
  chain: number[];
  editPattern: number;
  seqPlaying: boolean;
  automation: AutoLane[];
  setAutomation: (lanes: AutoLane[], opts?: { history?: boolean }) => void;
  curStep: number;
  curPat: number;
  rectSel: RectSel | null;
  lastCell: { step: number; note: number } | null;
  clipboard: SeqClipboard;

  setParam: (id: string, v: number) => void;
  // Modulation routing over the 16 fixed `mat{n}` slots (params-as-truth):
  // addRoute allocates the next free slot; updateSlot/clearSlot edit a slot by
  // its absolute number (1..16). All route through setParam so the engine stays
  // in sync exactly like any other param change.
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

  // note sequencer actions (mirror BL-1's pitch-seq conventions)
  _setPatterns: (next: Patterns) => void;
  toggleCell: (step: number, note: number, pattern?: number) => void;
  drawNote: (step: number, note: number, duration: number, pattern: number) => void;
  cycleStepOct: (step: number, pattern?: number) => void;
  toggleStepAcc: (step: number, pattern?: number) => void;
  setStepDuration: (step: number, duration: number, pattern?: number) => void;
  randomizeSeq: () => void;
  setEditPattern: (i: number) => void;
  setSequenceLength: (length: number) => void;
  loadPatternPreset: (index: number) => boolean;

  // step-sequencer editing: selection, clipboard, undo/redo, DnD (docs/editing-concept.md)
  setRectSel: (sel: RectSel | null) => void;
  selectAllSteps: () => void;
  clearStepSel: () => void;
  copySteps: () => void;
  cutSteps: () => void;
  pasteSteps: () => void;
  duplicateSteps: () => void;
  deleteSteps: () => void;
  moveRectSel: (dStep: number, dNote: number, opts?: { copy?: boolean }) => void;
  dropRect: (data: RectCells, atStep: number, dNote: number, clearSrc?: RectSel | null) => void;
  moveStepNote: (from: number, to: number, note: number, opts?: { copy?: boolean }, pattern?: number) => void;
  movePattern: (from: number, to: number, opts?: { copy?: boolean }) => void;
  undoSeq: () => void;
  redoSeq: () => void;
  _clearSeqHistory: () => void;

  seqPlay: () => void;
  seqStop: () => void;
  attachHosted: (e: SynthEngine) => void;

  powerOn: () => Promise<void>;
  playNote: (n: number, vel: number) => void;
  setActive: (note: number, on: boolean) => void;
  panic: () => void;
  bend: (semis: number) => void;
  setOctave: (o: number) => void;
  setMidiActive: (on: boolean) => void;
}

// Sequencer patterns + chain persist independently of presets.
const initialSeq = loadSeqState();

// Factory tables regenerated once for the editor's library/duplicate needs.
let factoryTablesCache: GeneratedTable[] | null = null;
export function factoryTables(): GeneratedTable[] {
  if (!factoryTablesCache) factoryTablesCache = generateTables();
  return factoryTablesCache;
}

// Bounded undo/redo stack for sequencer editing verbs (module state, mirrors
// BL-1/DR-1 — see makeHistory in shared/seqEdit.ts). Snapshots capture both
// patterns and chain since duplicate-bar can extend the sequence length.
interface SeqSnapshot { sequenceRhythm: SequenceRhythm; patterns: Patterns; chain: number[]; automation: AutoLane[] }
const seqHistory = makeHistory<SeqSnapshot>(50);

export const useStore = create<SynthStore>((set, get) => {
  const syncArp = () => {
    const { arp, arpMode, arpKeys, hosted } = get();
    if (hosted) return;
    engine.setArp(arpMode ? { ...arp, ...arpCompile(arp, arp.input === 'keys' ? arpKeys : arp.notes, get().chain.length) } : null);
    engine.setScale(arpMode ? undefined : scaleMap(arp, get().chain.length));
  };
  const snapshot = (): SeqSnapshot => ({ sequenceRhythm: copySequenceRhythm(get().sequenceRhythm), patterns: get().patterns, chain: get().chain, automation: copyAutomation(get().automation) });
  const pushSeqHistory = () => seqHistory.push(snapshot());
  const syncAutomation = () => {
    if (!get().hosted) engine.setSequenceAutomation(compileAutomation(get().automation, get().chain.length, undefined, 'WT1'));
  };

  // Worklet->UI telemetry, shared by standalone (powerOn) and hosted
  // (attachHosted, SQ-4 focus mode) engines: modulated wavetable positions for
  // the displays, and the live per-destination sums the knob dots animate from.
  const wireTelemetry = (e: SynthEngine) => {
    e.onviz = (d) => set({
      voiceCount: d.n,
      modPosA: d.a >= 0 ? d.a : -1,
      modPosB: d.b >= 0 ? d.b : -1,
    });
    e.onmod = feedModLive;
  };

  return {
  arp: loadArp(), arpMode: false, arpKeys: [],
  setArpMode: (on) => {
    if (get().hosted || get().arpMode === on) return;
    engine.panic();
    set({ arpMode: on, arpKeys: [], activeNotes: new Set(), curStep: -1, rectSel: null });
    syncArp();
  },
  updateArp: (patch) => {
    if (patch.input && patch.input !== get().arp.input && !get().hosted) engine.panic();
    const arp = { ...get().arp, ...patch };
    if (patch.input || patch.latch === false) set({ arpKeys: [...get().activeNotes] });
    set({ arp });
    try { localStorage.setItem('wt1-arp-v1', JSON.stringify(arp)); } catch { /* private storage */ }
    syncArp();
  },
  clearArpKeys: () => { set({ arpKeys: [], activeNotes: new Set() }); syncArp(); },
  params: defaultParams(),
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
  userPresets: loadUserPresets(),
  presetValue: 'f0',
  dirty: false,
  userTables: loadUserTablePool(),
  editorOsc: null,
  sequenceRhythm: copySequenceRhythm(initialSeq.sequenceRhythm),
  patterns: initialSeq.patterns,
  chain: sequenceChain(sequenceLengthFromChain(initialSeq.chain)),
  editPattern: 0,
  seqPlaying: false,
  automation: [],
  curStep: -1,
  curPat: 0,
  rectSel: null,
  lastCell: null,
  clipboard: null,

  setParam: (id, v) => {
    engine.setParam(id, v);
    set((s) => ({ params: { ...s.params, [id]: v }, dirty: true }));
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
    get().setParam(`mat${slot}.src`, next[`mat${slot}.src`]);
    get().setParam(`mat${slot}.dst`, next[`mat${slot}.dst`]);
    get().setParam(`mat${slot}.amt`, next[`mat${slot}.amt`]);
    get().setParam(`mat${slot}.pol`, next[`mat${slot}.pol`]);
    get().setParam(`mat${slot}.aux`, next[`mat${slot}.aux`]);
  },

  setModDrag: (src) => set({ modDrag: src }),
  setModFocus: (src) => set({ modFocus: src }),

  applyPreset: (presetParams, presetMods) => {
    const params = resolvePresetMods(presetParams, presetMods);
    engine.panic(get().hosted);
    engine.params = { ...params };
    set({ params, dirty: false });
    engine.applyAllParams();
  },

  loadPresetByValue: (val) => {
    const preset = val[0] === 'f' ? FACTORY_PRESETS[+val.slice(1)] : get().userPresets[+val.slice(1)];
    // A preset is self-describing: if it carries user tables, they become the
    // active pool so the table indices in its params resolve deterministically.
    if (preset.tables && preset.tables.length) {
      const userTables = preset.tables.map(deserializeUserTable);
      saveUserTablePool(userTables);
      engine.setUserTables(userTables.map((t) => t.table));
      set({ userTables });
    }
    get().applyPreset(preset.params, preset.mods);
    set({ presetValue: val });
  },

  stepPreset: (d) => {
    const opts = presetOptions(get().userPresets);
    let i = opts.findIndex((o) => o.value === get().presetValue);
    i = (i + d + opts.length) % opts.length;
    get().loadPresetByValue(opts[i].value);
  },

  savePreset: (name) => {
    // Embed the current user-table pool so the preset is portable on its own.
    // Routes are in the `mat*` params, so the param map alone is self-describing.
    const tables = get().userTables.map(serializeUserTable);
    const userPresets = saveUserPreset(name, get().params, tables);
    const opts = presetOptions(userPresets);
    // USER only: a factory preset with the same name sorts first in opts.
    const found = opts.find((o) => o.group === 'USER' && o.name === name);
    set({ userPresets, presetValue: found ? found.value : get().presetValue, dirty: false });
  },

  captureSound: () => {
    const { presetValue, params, dirty, userTables } = get();
    return { presetValue, params: { ...params }, dirty, userTables };
  },

  restoreSound: (snap) => {
    if (snap.userTables !== get().userTables) {
      if (!get().hosted) saveUserTablePool(snap.userTables);
      engine.setUserTables(snap.userTables.map((t) => t.table));
      set({ userTables: snap.userTables });
    }
    get().applyPreset(snap.params);
    set({ presetValue: snap.presetValue, dirty: snap.dirty });
  },

  applyVariant: (params) => {
    get().applyPreset(params);
    set({ dirty: true });
  },

  addUserTable: (u) => {
    const userTables = [...get().userTables, u];
    if (!get().hosted) saveUserTablePool(userTables);
    engine.setUserTables(userTables.map((t) => t.table));
    set({ userTables });
    const osc = get().editorOsc;
    if (osc) get().setParam(`${osc}.table`, TABLE_NAMES.length + userTables.length - 1);
  },

  deleteUserTable: (poolIndex) => {
    const userTables = get().userTables.filter((_, i) => i !== poolIndex);
    if (!get().hosted) saveUserTablePool(userTables);
    engine.setUserTables(userTables.map((t) => t.table));
    set({ userTables });
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
    const userTables = get().userTables.map((t, i) => (i === poolIndex ? { ...t, name: nm } : t));
    if (!get().hosted) saveUserTablePool(userTables);
    set({ userTables });
  },

  // In-place replace of an existing user table's waveform (and name), keeping
  // its pool index — so the editor's row selection and any osc references to
  // that table stay valid (unlike delete+add, which would shift indices).
  updateUserTable: (poolIndex, u) => {
    if (poolIndex < 0 || poolIndex >= get().userTables.length) return;
    const userTables = get().userTables.map((t, i) => (i === poolIndex ? u : t));
    if (!get().hosted) saveUserTablePool(userTables);
    engine.setUserTables(userTables.map((t) => t.table));
    set({ userTables });
  },

  duplicateUserTable: (poolIndex) => {
    const src = get().userTables[poolIndex];
    if (!src) return;
    const frames: Float32Array[] = [];
    for (let f = 0; f < src.frames; f++) frames.push(src.wave.slice(f * SIZE, (f + 1) * SIZE));
    const copy = makeUserTable((src.name + ' COPY').slice(0, 14), frames);
    get().addUserTable(copy); // appends, persists, re-pushes engine, assigns to osc
  },

  duplicateFactoryTable: (factoryIndex) => {
    const ft = factoryTables()[factoryIndex];
    if (!ft) return;
    const copy = makeUserTable((ft.name + ' COPY').slice(0, 14), framesFromGenerated(ft));
    get().addUserTable(copy);
  },

  openEditor: (osc) => set({ editorOsc: osc }),
  closeEditor: () => set({ editorOsc: null }),

  updateSequenceRhythm: (patch) => {
    const sequenceRhythm = updateSequenceRhythm(get().sequenceRhythm, patch);
    pushSeqHistory();
    set({ sequenceRhythm });
    if (!get().hosted) {
      engine.setSequenceRhythm(sequenceRhythm);
      saveSeqState(get().patterns, get().chain, sequenceRhythm);
    }
  },
  // ---------- note sequencer ----------
  // Every pattern mutation writes the store, pushes to the worklet and
  // persists to localStorage in one place.
  _setPatterns(next: Patterns) {
    set({ patterns: next });
    engine.setSeqPatterns(next);
    if (!get().hosted) saveSeqState(next, get().chain, get().sequenceRhythm);
  },

  drawNote: (step, note, duration, pattern) => {
    pushSeqHistory();
    get()._setPatterns(setStep(get().patterns, pattern, step, { on: true, note, duration }));
    const bar = get().hosted ? pattern : get().chain.indexOf(pattern);
    if (bar >= 0) set({ lastCell: { step: bar * STEPS + step, note } });
  },

  toggleCell: (step, note, pattern) => {
    const { patterns, editPattern } = get();
    const pat = pattern ?? editPattern;
    const cur = getStep(patterns, pat, step);
    const next = cur.on && cur.note === note
      ? setStep(patterns, pat, step, { on: false, acc: false })
      : setStep(patterns, pat, step, { on: true, note });
    get()._setPatterns(next);
    // Paste anchor, in absolute timeline steps (bar offset + local step).
    const bar = get().chain.indexOf(pat);
    if (bar >= 0) set({ lastCell: { step: bar * STEPS + step, note } });
  },

  cycleStepOct: (step, pattern) => {
    const { patterns, editPattern } = get();
    const pat = pattern ?? editPattern;
    const cur = getStep(patterns, pat, step);
    get()._setPatterns(setStep(patterns, pat, step, { oct: cycleOct(cur.oct) }));
  },

  toggleStepAcc: (step, pattern) => {
    const { patterns, editPattern } = get();
    const pat = pattern ?? editPattern;
    const cur = getStep(patterns, pat, step);
    if (!cur.on) return;
    get()._setPatterns(setStep(patterns, pat, step, { acc: !cur.acc }));
  },

  setStepDuration: (step, duration, pattern) => {
    const { patterns, editPattern } = get();
    const pat = pattern ?? editPattern;
    const cur = getStep(patterns, pat, step);
    if (!cur.on) return;
    get()._setPatterns(setStep(patterns, pat, step, { duration }));
  },

  randomizeSeq: () => {
    const { patterns, editPattern } = get();
    get()._setPatterns(writePattern(patterns, editPattern, randomPattern()));
  },

  setEditPattern: (i) => set({ editPattern: i }),

  setSequenceLength: (length) => {
    const chain = sequenceChain(length);
    set({ chain });
    syncArp();
    engine.setSeqChain(chain);
    syncAutomation();
    saveSeqState(get().patterns, chain, get().sequenceRhythm);
  },

  // Replaces the notes and length with a catalog line; the patch stays.
  loadPatternPreset: (index) => {
    const preset = NOTE_PATTERN_PRESETS[index];
    if (!preset || get().hosted) return false;
    pushSeqHistory();
    const { patterns, chain } = notePresetSequence(preset);
    set({ patterns, chain, editPattern: 0, rectSel: null });
    engine.setSeqPatterns(patterns);
    engine.setSeqChain(chain);
    syncArp();
    syncAutomation();
    saveSeqState(patterns, chain, get().sequenceRhythm);
    return true;
  },

  // ---------- step-sequencer editing (docs/editing-concept.md) ----------
  // Rect selections live in *absolute timeline steps* (0 .. bars*16-1) so a
  // rectangle can span bar boundaries; the chain-aware helpers map each
  // absolute step onto its bar's pattern.
  setRectSel: (sel) => {
    const maxStep = get().chain.length * STEPS - 1;
    set({
      rectSel: sel
        ? {
            stepFrom: Math.min(maxStep, Math.max(0, sel.stepFrom | 0)),
            stepTo: Math.min(maxStep, Math.max(0, sel.stepTo | 0)),
            noteFrom: Math.min(NOTE_LANES - 1, Math.max(0, sel.noteFrom | 0)),
            noteTo: Math.min(NOTE_LANES - 1, Math.max(0, sel.noteTo | 0)),
          }
        : null,
    });
  },

  selectAllSteps: () => set({ rectSel: { stepFrom: 0, stepTo: get().chain.length * STEPS - 1, noteFrom: 0, noteTo: NOTE_LANES - 1 } }),

  clearStepSel: () => set({ rectSel: null }),

  copySteps: () => {
    const { patterns, editPattern, chain, rectSel } = get();
    if (rectSel) {
      set({ clipboard: { kind: 'rect', data: copyRectChain(patterns, WT1_LAYOUT, chain, rectSel) } });
    } else {
      set({ clipboard: { kind: 'pattern', data: copyPattern(patterns, WT1_LAYOUT, editPattern) } });
    }
  },

  cutSteps: () => {
    const { patterns, editPattern, chain, rectSel } = get();
    get().copySteps();
    pushSeqHistory();
    if (rectSel) {
      get()._setPatterns(clearRectChain(patterns, WT1_LAYOUT, chain, rectSel, EMPTY_STEP));
    } else {
      get()._setPatterns(clearRange(patterns, WT1_LAYOUT, editPattern, 0, STEPS - 1, EMPTY_STEP));
    }
  },

  pasteSteps: () => {
    const { patterns, editPattern, chain, rectSel, lastCell, clipboard } = get();
    if (!clipboard) return;
    pushSeqHistory();
    if (clipboard.kind === 'pattern') {
      get()._setPatterns(pastePattern(patterns, WT1_LAYOUT, editPattern, clipboard.data));
      return;
    }
    // Anchor: current rect's top-left, else the last-touched cell, else the
    // timeline start (all in absolute steps).
    const anchor = rectSel
      ? { step: rectNorm(rectSel).stepLo, note: rectNorm(rectSel).noteHi }
      : lastCell ?? { step: 0, note: clipboard.data.noteHi };
    const dNote = anchor.note - clipboard.data.noteHi;
    get()._setPatterns(pasteRectChain(patterns, WT1_LAYOUT, chain, anchor.step, dNote, clipboard.data, NOTE_LANES - 1));
    get().setRectSel({
      stepFrom: anchor.step,
      stepTo: anchor.step + clipboard.data.wSteps - 1,
      noteFrom: anchor.note - (clipboard.data.noteHi - clipboard.data.noteLo),
      noteTo: anchor.note,
    });
  },

  duplicateSteps: () => {
    const { patterns, editPattern, rectSel, chain } = get();
    if (rectSel) {
      const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rectSel);
      const at = stepHi + 1;
      if (at >= chain.length * STEPS) return; // nothing past the timeline end — full no-op
      pushSeqHistory();
      const data = copyRectChain(patterns, WT1_LAYOUT, chain, rectSel);
      get()._setPatterns(pasteRectChain(patterns, WT1_LAYOUT, chain, at, 0, data, NOTE_LANES - 1));
      get().setRectSel({ stepFrom: at, stepTo: at + (stepHi - stepLo), noteFrom: noteLo, noteTo: noteHi });
    } else {
      pushSeqHistory();
      // No selection: classic "duplicate bar" — copy the edit pattern onto the
      // next bar, extending the sequence length if that bar isn't in it yet.
      const nextPat = Math.min(NPATTERNS - 1, editPattern + 1);
      const data = copyPattern(patterns, WT1_LAYOUT, editPattern);
      get()._setPatterns(pastePattern(patterns, WT1_LAYOUT, nextPat, data));
      if (chain.length <= nextPat) get().setSequenceLength(nextPat + 1);
      set({ editPattern: nextPat });
    }
  },

  deleteSteps: () => {
    const { patterns, chain, rectSel } = get();
    if (!rectSel) return;
    pushSeqHistory();
    get()._setPatterns(clearRectChain(patterns, WT1_LAYOUT, chain, rectSel, EMPTY_STEP));
  },

  moveRectSel: (dStep, dNote, opts = {}) => {
    const { patterns, chain, rectSel } = get();
    if (!rectSel) return;
    const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rectSel);
    // Clamp so the whole rect stays inside the timeline — stored selection
    // and pasted content must always agree.
    const ds = Math.min(chain.length * STEPS - 1 - stepHi, Math.max(-stepLo, dStep | 0));
    const dn = Math.min(NOTE_LANES - 1 - noteHi, Math.max(-noteLo, dNote | 0));
    if (ds === 0 && dn === 0) return;
    pushSeqHistory();
    get()._setPatterns(moveRectChain(patterns, WT1_LAYOUT, chain, rectSel, ds, dn, { copy: opts.copy, emptyStep: EMPTY_STEP, maxNote: NOTE_LANES - 1 }));
    set({ rectSel: { stepFrom: stepLo + ds, stepTo: stepHi + ds, noteFrom: noteLo + dn, noteTo: noteHi + dn } });
  },

  // Ghost-paste drop (menu CUT/COPY → cells follow the cursor → click): stamp
  // the picked-up cells at the drop anchor (absolute steps, so drops land on
  // any bar and may straddle a boundary), clearing the CUT source in the
  // same undo entry. Out-of-range cells are dropped, like any paste.
  dropRect: (data, atStep, dNote, clearSrc) => {
    const { patterns, chain } = get();
    if (!data.cells.length) return;
    pushSeqHistory();
    const base = clearSrc ? clearRectChain(patterns, WT1_LAYOUT, chain, clearSrc, EMPTY_STEP) : patterns;
    get()._setPatterns(pasteRectChain(base, WT1_LAYOUT, chain, atStep, dNote, data, NOTE_LANES - 1));
    get().setRectSel({
      stepFrom: atStep,
      stepTo: atStep + data.wSteps - 1,
      noteFrom: data.noteLo + dNote,
      noteTo: data.noteHi + dNote,
    });
  },

  // Grid note drag: move (or Alt-copy) one lit step to another step/lane,
  // carrying oct/acc/duration along. One history push → one undo entry.
  moveStepNote: (from, to, note, opts = {}, pattern) => {
    const { patterns, editPattern } = get();
    const pat = pattern ?? editPattern;
    const src = getStep(patterns, pat, from);
    if (!src.on) return;
    if (from === to && src.note === note) return;
    pushSeqHistory();
    let next = patterns;
    if (from !== to && !opts.copy) next = setStep(next, pat, from, { on: false, acc: false });
    next = setStep(next, pat, to, { on: true, note, oct: src.oct, acc: src.acc, duration: src.duration });
    get()._setPatterns(next);
  },

  movePattern: (from, to, opts = {}) => {
    const a = Math.min(NPATTERNS - 1, Math.max(0, from | 0));
    const b = Math.min(NPATTERNS - 1, Math.max(0, to | 0));
    if (a === b) return;
    const { patterns } = get();
    pushSeqHistory();
    const dataA = copyPattern(patterns, WT1_LAYOUT, a);
    if (opts.copy) {
      get()._setPatterns(pastePattern(patterns, WT1_LAYOUT, b, dataA));
    } else {
      const dataB = copyPattern(patterns, WT1_LAYOUT, b);
      const swapped = pastePattern(pastePattern(patterns, WT1_LAYOUT, a, dataB), WT1_LAYOUT, b, dataA);
      get()._setPatterns(swapped);
    }
  },

  undoSeq: () => {
    const prev = seqHistory.undo(snapshot());
    if (!prev) return;
    set({ patterns: prev.patterns, sequenceRhythm: copySequenceRhythm(prev.sequenceRhythm), chain: prev.chain, automation: copyAutomation(prev.automation) });
    syncAutomation();
    engine.setSeqChain(prev.chain);
    syncArp();
    if (!get().hosted) engine.setSequenceRhythm(get().sequenceRhythm);
    engine.setSeqPatterns(prev.patterns);
    if (!get().hosted) saveSeqState(prev.patterns, prev.chain, get().sequenceRhythm);
  },

  redoSeq: () => {
    const next = seqHistory.redo(snapshot());
    if (!next) return;
    set({ patterns: next.patterns, sequenceRhythm: copySequenceRhythm(next.sequenceRhythm), chain: next.chain, automation: copyAutomation(next.automation) });
    syncAutomation();
    engine.setSeqChain(next.chain);
    syncArp();
    if (!get().hosted) engine.setSequenceRhythm(get().sequenceRhythm);
    engine.setSeqPatterns(next.patterns);
    if (!get().hosted) saveSeqState(next.patterns, next.chain, get().sequenceRhythm);
  },

  _clearSeqHistory: () => seqHistory.clear(),

  setAutomation: (lanes, opts = {}) => {
    if (get().hosted || validateAutomation(lanes, 'WT1')) return;
    if (opts.history !== false) pushSeqHistory();
    set({ automation: copyAutomation(lanes) });
    syncAutomation();
  },

  seqPlay: () => {
    if (get().hosted) return;
    engine.seqPlay();
    set({ seqPlaying: true });
  },

  seqStop: () => {
    if (get().hosted) return;
    engine.seqStop();
    set({ seqPlaying: false, curStep: -1 });
  },

  attachHosted: (e) => {
    engine = e;
    wireTelemetry(e);
    set({
      hosted: true,
      powered: true,
      seqPlaying: false,
      curStep: -1,
      params: { ...e.params },
    });
  },

  powerOn: async () => {
    await engine.init();
    engine.setUserTables(get().userTables.map((t) => t.table));
    wireTelemetry(engine);
    engine.onstep = (d) => set({ curStep: d.s, curPat: d.pat });
    engine.setSeqPatterns(get().patterns);
    engine.setSeqChain(get().chain);
    engine.setSequenceRhythm(get().sequenceRhythm);
    syncAutomation();
    syncArp();
    set({ powered: true });
  },

  playNote: (n, vel) => {
    if (get().arpMode && !get().hosted) {
      const { arp, arpKeys, activeNotes } = get();
      if (arp.input === 'keys') {
        const keys = vel > 0
          ? [...new Set([...(arp.latch && !activeNotes.size ? [] : arpKeys), n])]
          : arp.latch ? arpKeys : arpKeys.filter(k => k !== n);
        set({ arpKeys: keys });
        get().setActive(n, vel > 0);
        syncArp();
        return;
      }
    }
    if (vel > 0) {
      engine.noteOn(n, vel);
      get().setActive(n, true);
    } else {
      engine.noteOff(n);
      get().setActive(n, false);
    }
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
    if (get().seqPlaying) get().seqStop();
    engine.panic();
    set({ activeNotes: new Set(), arpKeys: [] });
    syncArp();
  },

  bend: (semis) => engine.bend(semis),

  setOctave: (o) => set({ octave: o }),
  setMidiActive: (on) => set({ midiActive: on }),
  };
});
