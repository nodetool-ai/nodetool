/**
 * Shared event plumbing for live devices that run in an AudioWorklet.
 *
 * Worklet protocol every FableSynth processor implements for the timeline:
 *   - `{ t: "evs", ev: Float64Array }` queues events. `ev` is flat
 *     `[frame, on, pitch, velocity]` quadruples: `frame` is an absolute
 *     context frame, `on` is 1 or 0, `velocity` is 0..1. The processor
 *     applies each event at its frame (or the start of the render quantum
 *     holding it) and drops events whose frame has passed.
 *   - `{ t: "evclear" }` drops every queued event and releases every note.
 *   - `processorOptions.events` carries the same Float64Array for an offline
 *     render, so the queue is full before the first quantum.
 */

import type { MidiInstrument } from "@nodetool-ai/timeline";

import type { LiveInstrumentDevice, LiveNoteEvent } from "./liveDevice";

/** Encode events for the worklet's `evs` message. */
export function encodeLiveEvents(
  events: readonly LiveNoteEvent[],
  sampleRate: number
): Float64Array {
  const out = new Float64Array(events.length * 4);
  events.forEach((event, i) => {
    out[i * 4] = Math.round(event.timeSec * sampleRate);
    out[i * 4 + 1] = event.on ? 1 : 0;
    out[i * 4 + 2] = event.pitch;
    out[i * 4 + 3] = event.on ? Math.min(1, Math.max(0, event.velocity / 127)) : 0;
  });
  return out;
}

export abstract class WorkletInstrumentDevice implements LiveInstrumentDevice {
  private readonly queued = new Map<string, LiveNoteEvent[]>();

  protected constructor(
    protected readonly ctx: BaseAudioContext,
    protected readonly node: AudioWorkletNode,
    readonly output: AudioNode
  ) {}

  abstract setInstrument(instrument: MidiInstrument): void;
  abstract noteOn(pitch: number, velocity: number): void;
  abstract noteOff(pitch: number): void;
  abstract setTempo(bpm: number, beatZeroSec: number): void;

  schedule(events: LiveNoteEvent[], tag: string): void {
    if (events.length === 0) return;
    this.queued.set(tag, [...(this.queued.get(tag) ?? []), ...events]);
    this.post(events);
  }

  clear(tag?: string): void {
    if (tag === undefined) {
      this.queued.clear();
    } else if (!this.queued.delete(tag)) {
      return;
    }
    this.node.port.postMessage({ t: "evclear" });
    // The worklet's queue is one list, so the clips still playing are queued
    // again from now on.
    const now = this.ctx.currentTime;
    for (const [key, events] of this.queued) {
      const pending = events.filter((event) => event.timeSec > now);
      this.queued.set(key, pending);
      this.post(pending);
    }
  }

  dispose(): void {
    this.queued.clear();
    this.node.port.postMessage({ t: "evclear" });
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.output.disconnect();
  }

  private post(events: readonly LiveNoteEvent[]): void {
    if (events.length === 0) return;
    const ev = encodeLiveEvents(events, this.ctx.sampleRate);
    this.node.port.postMessage({ t: "evs", ev }, [ev.buffer]);
  }
}
