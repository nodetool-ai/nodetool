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

import type { DeviceAutomationLane, LiveInstrumentDevice, LiveNoteEvent } from "./liveDevice";

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

/**
 * Send automation lanes to a processor that loaded
 * `param-automation-worklet.js`: every lane it plays is replaced.
 */
export function postAutomation(
  port: MessagePort,
  lanes: readonly DeviceAutomationLane[],
  sampleRate: number
): void {
  const encoded = lanes.map((lane) => {
    const ev = new Float64Array(lane.points.length * 2);
    lane.points.forEach((point, i) => {
      ev[i * 2] = Math.round(point.timeSec * sampleRate);
      ev[i * 2 + 1] = point.value;
    });
    return { k: lane.param, ev };
  });
  port.postMessage(
    { t: "pauto", clear: true, lanes: encoded },
    encoded.map((lane) => lane.ev.buffer)
  );
}

const SYNC_TIMEOUT_MS = 2000;
let syncSerial = 0;

/**
 * Resolves once the processor has handled every message posted to `port`
 * before this call, or after a timeout, so a render never hangs on it.
 */
export function syncAutomation(port: MessagePort): Promise<void> {
  const n = ++syncSerial;
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      port.removeEventListener("message", onMessage);
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { t?: string; n?: number } | null;
      if (data?.t === "pauto-ack" && data.n === n) done();
    };
    const timer = setTimeout(done, SYNC_TIMEOUT_MS);
    port.addEventListener("message", onMessage);
    port.postMessage({ t: "pauto-sync", n });
  });
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

  setAutomation(lanes: readonly DeviceAutomationLane[]): void {
    postAutomation(this.node.port, lanes, this.ctx.sampleRate);
  }

  syncAutomation(): Promise<void> {
    return syncAutomation(this.node.port);
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
