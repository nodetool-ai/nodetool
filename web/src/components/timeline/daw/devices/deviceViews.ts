/**
 * Which React view edits a device. Instrument views take the midi track id;
 * FX views take the track id (or null for the master) and the effect id.
 * Views are loaded on demand so the device UIs stay out of the editor's
 * first bundle.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { MidiInstrument } from "@nodetool-ai/timeline";

export interface InstrumentDeviceViewProps {
  trackId: string;
}

export interface FxDeviceViewProps {
  /** The track carrying the effect, or null for the master channel. */
  trackId: string | null;
  effectId: string;
}

type Lazy<P> = LazyExoticComponent<ComponentType<P>>;

const instrumentViews = new Map<MidiInstrument["type"], Lazy<InstrumentDeviceViewProps>>();
const fxViews = new Map<string, Lazy<FxDeviceViewProps>>();

export function registerInstrumentView(
  type: MidiInstrument["type"],
  load: () => Promise<{ default: ComponentType<InstrumentDeviceViewProps> }>
): void {
  instrumentViews.set(type, lazy(load));
}

/** Register the view for an effect, keyed by `TrackEffect.type` (and `kind` for `fable` effects as `fable:<kind>`). */
export function registerFxView(
  key: string,
  load: () => Promise<{ default: ComponentType<FxDeviceViewProps> }>
): void {
  fxViews.set(key, lazy(load));
}

export function instrumentView(
  type: MidiInstrument["type"] | undefined
): Lazy<InstrumentDeviceViewProps> | null {
  return type ? instrumentViews.get(type) ?? null : null;
}

export function fxView(key: string): Lazy<FxDeviceViewProps> | null {
  return fxViews.get(key) ?? null;
}
