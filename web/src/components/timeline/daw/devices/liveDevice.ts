/**
 * Live instrument devices: an instrument that runs on the audio thread (a
 * FableSynth AudioWorklet) instead of being pre-rendered into a buffer.
 *
 * The timeline owns one device per midi track. `AudioGraph` creates it when
 * the track's instrument has a live factory, connects its output into the
 * track's channel, and hands it note events stamped on the context clock.
 * The same device runs in the export's `OfflineAudioContext`, where every
 * event is known before rendering starts.
 */

import type { MidiInstrument } from "@nodetool-ai/timeline";

export interface LiveNoteEvent {
  /** When it happens, in seconds on the device's context clock. */
  timeSec: number;
  pitch: number;
  /** 1..127 for a note-on, ignored for a note-off. */
  velocity: number;
  on: boolean;
}

/** One automated device parameter as ramps on the device's context clock. */
export interface DeviceAutomationLane {
  /** The device's own parameter id. */
  param: string;
  /** In time order. The value ramps linearly between them and holds outside. */
  points: readonly { timeSec: number; value: number }[];
}

export interface LiveInstrumentDevice {
  /** Stereo output. The host connects it; the device never touches the destination. */
  readonly output: AudioNode;
  /** Apply the track's instrument. Called on every track change, so only send what differs. */
  setInstrument(instrument: MidiInstrument): void;
  /**
   * Queue note events. `tag` names the clip they came from, so the host can
   * withdraw one clip's events with `clear(tag)` and leave the others queued.
   */
  schedule(events: LiveNoteEvent[], tag: string): void;
  /**
   * Withdraw queued events (one clip's, or all when `tag` is absent) and
   * release the notes they started.
   */
  clear(tag?: string): void;
  /** Play a note now, outside any clip (the on-screen keyboard). */
  noteOn(pitch: number, velocity: number): void;
  noteOff(pitch: number): void;
  /**
   * The timeline tempo, and the context time of beat one, for tempo-synced
   * LFOs and delays.
   */
  setTempo(bpm: number, beatZeroSec: number): void;
  /**
   * Replace every automation lane the device plays. Optional, so a device
   * without automation still plays its parameters' stored values.
   */
  setAutomation?(lanes: readonly DeviceAutomationLane[]): void;
  /** Resolves once the processor holds every automation lane sent before. */
  syncAutomation?(): Promise<void>;
  dispose(): void;
}

export interface LiveDeviceOptions {
  /**
   * Every event of an offline render, delivered with the processor's
   * construction so none arrives after rendering has started.
   */
  events?: LiveNoteEvent[];
}

export type LiveDeviceFactory = (
  ctx: BaseAudioContext,
  instrument: MidiInstrument,
  options?: LiveDeviceOptions
) => Promise<LiveInstrumentDevice>;

const factories = new Map<MidiInstrument["type"], LiveDeviceFactory>();

/** Register the live device that plays `type`. Device modules call this when imported. */
export function registerLiveDevice(
  type: MidiInstrument["type"],
  factory: LiveDeviceFactory
): void {
  factories.set(type, factory);
}

/** The live factory for an instrument, or null when it plays pre-rendered. */
export function liveDeviceFactory(
  instrument: MidiInstrument | undefined
): LiveDeviceFactory | null {
  if (!instrument) return null;
  return factories.get(instrument.type) ?? null;
}
