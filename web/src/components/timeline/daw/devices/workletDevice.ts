/**
 * Shared event plumbing for live devices that run in an AudioWorklet.
 *
 * Worklet protocol every FableSynth processor implements for the timeline:
 *   - `{ t: "evs", ev: Float64Array, tag?: string }` queues events. `ev` is flat
 *     `[frame, on, pitch, velocity]` quadruples: `frame` is an absolute
 *     context frame, `on` is 1 or 0, `velocity` is 0..1. The processor
 *     applies each event at its frame (or the start of the render quantum
 *     holding it) and drops events whose frame has passed.
 *   - `{ t: "evclear", tag }` removes a clip’s events and held notes.
 *     Without a tag it drops every queued event and releases every note.
 *   - `processorOptions.events` carries the same Float64Array for an offline
 *     render, so the queue is full before the first quantum.
 */

import {
  MIDI_PITCH_BEND_RANGE_SEMITONES,
  type MidiInstrument
} from "@nodetool-ai/timeline";

import type {
  DeviceAutomationLane,
  LiveControllerEvent,
  LiveInstrumentDevice,
  LiveNoteEvent
} from "./liveDevice";

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
 * Parallel per-event pitch bend offsets (in semitones) for `evs` /
 * `processorOptions.eventPitchOffsets`. Returns undefined when every event has
 * zero pitch offset so plain scores pay zero overhead.
 */
export function encodeLivePitchOffsets(
  events: readonly LiveNoteEvent[] | undefined
): Float64Array | undefined {
  if (!events || !events.some((e) => e.on && e.pitchOffset !== undefined && e.pitchOffset !== 0)) {
    return undefined;
  }
  const out = new Float64Array(events.length);
  events.forEach((event, i) => {
    out[i] = event.on && Number.isFinite(event.pitchOffset) ? event.pitchOffset! : 0;
  });
  return out;
}

/**
 * Encode MIDI controller events as flat `[frame, kindCode, param, value]`
 * quadruples for the worklet's `cevs` message / `processorOptions.controllers`:
 *   - kindCode 1: pitchBend (`value` in semitones)
 *   - kindCode 2: cc (`param` = cc number, `value` = 0..127)
 *   - kindCode 3: channelPressure (`value` = 0..127)
 *   - kindCode 4: polyPressure (`param` = pitch, `value` = 0..127)
 */
export function encodeLiveControllers(
  events: readonly LiveControllerEvent[],
  sampleRate: number
): Float64Array {
  const out = new Float64Array(events.length * 4);
  events.forEach((event, i) => {
    out[i * 4] = Math.round(event.timeSec * sampleRate);
    if (event.kind === "pitchBend") {
      out[i * 4 + 1] = 1;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = (event.value / 8192) * MIDI_PITCH_BEND_RANGE_SEMITONES;
    } else if (event.kind === "cc") {
      out[i * 4 + 1] = 2;
      out[i * 4 + 2] = event.cc ?? 0;
      out[i * 4 + 3] = event.value;
    } else if (event.kind === "channelPressure") {
      out[i * 4 + 1] = 3;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = event.value;
    } else {
      out[i * 4 + 1] = 4;
      out[i * 4 + 2] = event.pitch ?? 0;
      out[i * 4 + 3] = event.value;
    }
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
  private automationParams = new Set<string>();
  protected abstract get authoredParams(): Readonly<Record<string, number>>;
  private readonly queued = new Map<string, LiveNoteEvent[]>();
  private readonly queuedControllers = new Map<string, LiveControllerEvent[]>();

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
    this.post(events, tag);
  }

  scheduleControllers(events: LiveControllerEvent[], tag: string): void {
    if (events.length === 0) return;
    this.queuedControllers.set(tag, [
      ...(this.queuedControllers.get(tag) ?? []),
      ...events
    ]);
    const ev = encodeLiveControllers(events, this.ctx.sampleRate);
    this.node.port.postMessage({ t: "cevs", ev, tag }, [ev.buffer]);
  }

  clear(tag?: string): void {
    if (tag === undefined) {
      this.queued.clear();
      this.queuedControllers.clear();
    } else {
      const removedNotes = this.queued.delete(tag);
      const removedControllers = this.queuedControllers.delete(tag);
      if (!removedNotes && !removedControllers) return;
    }
    this.node.port.postMessage(tag === undefined ? { t: "evclear" } : { t: "evclear", tag });
  }

  setAutomation(lanes: readonly DeviceAutomationLane[]): void {
    const next = new Set(lanes.filter((lane) => lane.points.length > 0).map((lane) => lane.param));
    postAutomation(this.node.port, lanes, this.ctx.sampleRate);
    for (const key of this.automationParams) {
      const value = this.authoredParams[key];
      if (!next.has(key) && Number.isFinite(value)) {
        this.node.port.postMessage({ t: "p", k: key, v: value });
      }
    }
    this.automationParams = next;
  }

  syncAutomation(): Promise<void> {
    return syncAutomation(this.node.port);
  }

  dispose(): void {
    this.queued.clear();
    this.queuedControllers.clear();
    this.node.port.postMessage({ t: "evclear" });
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.output.disconnect();
  }

  private post(events: readonly LiveNoteEvent[], tag: string): void {
    if (events.length === 0) return;
    const ev = encodeLiveEvents(events, this.ctx.sampleRate);
    const pitchOffsets = encodeLivePitchOffsets(events);
    if (pitchOffsets) {
      this.node.port.postMessage({ t: "evs", ev, pitchOffsets, tag }, [
        ev.buffer,
        pitchOffsets.buffer
      ]);
    } else {
      this.node.port.postMessage({ t: "evs", ev, tag }, [ev.buffer]);
    }
  }
}
