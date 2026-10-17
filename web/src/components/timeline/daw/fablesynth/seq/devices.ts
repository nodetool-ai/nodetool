import type { SequenceRhythm } from '../shared/sequenceRhythm';
// SeqDevice adapters — one per machine, each a thin wrapper over the
// existing engine class translating the uniform clip commands of
// docs/sq4-clips.md §8 into that engine's messages. Devices execute stamped
// commands; all musical decisions stay in the conductor (store.ts).

import { BassEngine } from '../bass/engine/bass-synth';
import type { AutoConfig } from './clipAutomation';
import { FACTORY_PATCHES, patchToState } from '../bass/patches';
import { DrumEngine } from '../drum/engine/drum-synth';
import { FACTORY_KITS, kitToState } from '../drum/kits';
import { SynthEngine } from '../engine/synth';
import { FACTORY_PRESETS, resolvePresetMods } from '../presets';
import type { PatchDoc } from './protocol';
import type { ArpConfig } from './clipArp';
import type { DrumRhythm } from '../drum/rhythm';

export interface SeqDevice {
  init(ctx: AudioContext, output: AudioNode): Promise<void>;
  applyPatch(patch: PatchDoc): void;
  setTempo(bpm: number, swing: number, anchor: number): void;
  scheduleClip(pattern: Uint8Array, bars: number, atFrame: number, arp?: ArpConfig, rhythm?: DrumRhythm, auto?: AutoConfig[], sequenceRhythm?: SequenceRhythm, scale?: number[][]): void;
  scheduleStop(atFrame: number): void;
  updateClip(pattern: Uint8Array, bars: number, arp?: ArpConfig, rhythm?: DrumRhythm, auto?: AutoConfig[], sequenceRhythm?: SequenceRhythm, scale?: number[][]): void;
  panic(): void;
  onClipStart: ((frame: number) => void) | null;
  onClipStop: ((frame: number) => void) | null;
  onPos: ((step: number, bar: number) => void) | null;
  /** The live engine behind this device (absent on test fakes). */
  readonly engine?: DrumEngine | BassEngine | SynthEngine;
  readonly latencySamples: number;
}

// The three engines expose an identical hosted surface (init opts, host/
// tempo/clip messages, callbacks) — this base class holds everything except
// patch application.
abstract class EngineDevice<E extends DrumEngine | BassEngine | SynthEngine> implements SeqDevice {
  engine: E;
  onClipStart: ((frame: number) => void) | null = null;
  onClipStop: ((frame: number) => void) | null = null;
  onPos: ((step: number, bar: number) => void) | null = null;

  constructor(engine: E) {
    this.engine = engine;
  }

  get latencySamples(): number { return this.engine.latencySamples; }

  async init(ctx: AudioContext, output: AudioNode): Promise<void> {
    await this.engine.init({ ctx, output });
    this.engine.setHostMode(true);
    this.engine.onclipstart = (frame) => this.onClipStart?.(frame);
    this.engine.onclipstop = (frame) => this.onClipStop?.(frame);
    this.engine.onpos = (d: { step: number; bar: number }) => this.onPos?.(d.step, d.bar);
  }

  abstract applyPatch(patch: PatchDoc): void;

  setTempo(bpm: number, swing: number, anchor: number): void {
    this.engine.setTempo(bpm, swing, anchor);
  }

  // Automation follows its clip message: the worklet attaches it to the
  // pending clip (launch) or the active one (hot-swap).
  scheduleClip(pattern: Uint8Array, bars: number, atFrame: number, arp?: ArpConfig, rhythm?: DrumRhythm, auto: AutoConfig[] = [], sequenceRhythm?: SequenceRhythm, scale?: number[][]): void {
    if (this.engine instanceof DrumEngine) this.engine.scheduleClip(pattern, bars, atFrame, rhythm);
    else this.engine.scheduleClip(pattern, bars, atFrame, arp, sequenceRhythm, scale);
    this.engine.setClipAutomation(auto);
  }

  scheduleStop(atFrame: number): void {
    this.engine.scheduleStop(atFrame);
  }

  updateClip(pattern: Uint8Array, bars: number, arp?: ArpConfig, rhythm?: DrumRhythm, auto: AutoConfig[] = [], sequenceRhythm?: SequenceRhythm, scale?: number[][]): void {
    if (this.engine instanceof DrumEngine) this.engine.updateClip(pattern, bars, rhythm);
    else this.engine.updateClip(pattern, bars, arp, sequenceRhythm, scale);
    this.engine.setClipAutomation(auto);
  }

  panic(): void {
    this.engine.panic();
  }

  // Merge, don't replace: factory patches are complete sets (identical
  // result), but an imported inline patch may be partial — overwriting
  // wholesale would drop required defaults and feed NaN into the FX chain.
  // Matches the JUCE port's overlayInline semantics.
  protected applyParams(params: Record<string, number>): void {
    this.engine.params = { ...this.engine.params, ...params };
    this.engine.applyAllParams();
  }
}

// Hosted patch edits snapshot raw engine params ({ params }) — docs spec
// 2026-07-12-sq4-device-focus-design.md §4. Pad names / user tables are v2.
function inlineParams(patch: PatchDoc): Record<string, number> | null {
  if (patch.kind !== 'inline') return null;
  const data = patch.data as { params?: Record<string, number> } | null;
  return data?.params ?? null;
}

export class Dr1Device extends EngineDevice<DrumEngine> {
  constructor() {
    super(new DrumEngine());
  }

  applyPatch(patch: PatchDoc): void {
    const inline = inlineParams(patch);
    if (inline) {
      this.applyParams(inline);
      return;
    }
    const index = patch.kind === 'factory' ? patch.index : 0;
    const kit = FACTORY_KITS[index] ?? FACTORY_KITS[0];
    this.applyParams(kitToState(kit).params);
  }
}

export class Bl1Device extends EngineDevice<BassEngine> {
  constructor() {
    super(new BassEngine());
  }

  applyPatch(patch: PatchDoc): void {
    const inline = inlineParams(patch);
    if (inline) {
      this.applyParams(inline);
      return;
    }
    const index = patch.kind === 'factory' ? patch.index : 0;
    const p = FACTORY_PATCHES[index] ?? FACTORY_PATCHES[0];
    this.applyParams(patchToState(p).params);
  }
}

export class Wt1Device extends EngineDevice<SynthEngine> {
  constructor() {
    super(new SynthEngine());
  }

  applyPatch(patch: PatchDoc): void {
    const inline = inlineParams(patch);
    if (inline) {
      this.applyParams(inline);
      return;
    }
    const index = patch.kind === 'factory' ? patch.index : 0;
    const p = FACTORY_PRESETS[index] ?? FACTORY_PRESETS[0];
    this.applyParams(resolvePresetMods(p.params, p.mods));
  }
}

/** Factory index a patch resolves to for display/stepping: the factory
 *  index, an inline patch's remembered base, or -1 when it has no origin. */
export function patchBaseIndex(patch: PatchDoc): number {
  if (patch.kind === 'factory') return patch.index;
  return patch.base ?? -1;
}

function factoryName(machine: 'DR1' | 'BL1' | 'WT1', index: number): string {
  switch (machine) {
    case 'DR1': return FACTORY_KITS[index]?.name ?? 'KIT ?';
    case 'BL1': return FACTORY_PATCHES[index]?.name ?? 'PATCH ?';
    default: return FACTORY_PRESETS[index]?.name ?? 'PRESET ?';
  }
}

/** Display name of a track's patch (the head-card chip). Inline edits keep
 *  their factory origin's name with a `*` dirty marker; only origin-less
 *  patches read as CUSTOM. */
export function patchName(machine: 'DR1' | 'BL1' | 'WT1', patch: PatchDoc): string {
  const base = patchBaseIndex(patch);
  if (base < 0) return 'CUSTOM';
  const name = factoryName(machine, base);
  return patch.kind === 'inline' ? `${name} *` : name;
}

/** Factory patch names shared by track heads and the focused device toolbar. */
export function factoryPatchNames(machine: 'DR1' | 'BL1' | 'WT1'): string[] {
  switch (machine) {
    case 'DR1': return FACTORY_KITS.map((patch) => patch.name);
    case 'BL1': return FACTORY_PATCHES.map((patch) => patch.name);
    default: return FACTORY_PRESETS.map((patch) => patch.name);
  }
}

/** Step a factory bank predictably, including when the current patch is inline. */
export function stepFactoryPatchIndex(machine: 'DR1' | 'BL1' | 'WT1', current: number, delta: number): number {
  const count = factoryPatchNames(machine).length;
  if (!count) return 0;
  if (current < 0) return delta < 0 ? count - 1 : 0;
  return (current + delta + count) % count;
}

export function makeDevice(machine: 'DR1' | 'BL1' | 'WT1'): SeqDevice {
  switch (machine) {
    case 'DR1': return new Dr1Device();
    case 'BL1': return new Bl1Device();
    default: return new Wt1Device();
  }
}
