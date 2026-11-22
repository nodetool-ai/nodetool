/**
 * AutomationRecorder — recording passes for the mixer automation modes.
 *
 * Touch, Latch and Write record the volume and pan a user plays while the
 * transport runs (contract AU7). A pass keeps its own value out of the track
 * (`volumeDb` and `pan` do not change) and out of the lane's playback, and
 * writes the thinned samples into the lane when it ends. Every end of a pass
 * is one undo entry.
 *
 * The recorder is bound to one timeline instance: it watches the transport
 * of that instance and edits its document. Controls call `gestureStart`,
 * `record` and `gestureEnd` before they write the track themselves.
 */

import { useSyncExternalStore } from "react";
import {
  automationModeOf,
  createAutomationLane,
  automationValueAt,
  findAutomationLane,
  isAutomationLaneActive,
  writeAutomationPass,
  type AutomationLane,
  type AutomationMode,
  type AutomationSample,
  type AutomationTarget
} from "@nodetool-ai/timeline";

import { MIXER_RANGE } from "../../components/timeline/Tracks/automation/automationLayout";
import { useTimelinePlaybackStoreApi, useTimelineStoreApi } from "./TimelineInstance";
import type { TimelineStoreApi } from "./TimelineStore";
import type { TimelinePlaybackStoreApi } from "./TimelinePlaybackStore";
import { runAsOneUndoEntry } from "./useTimelineHistoryBatch";

export type RecordedParam = "volumeDb" | "pan";

/** The pass ends this long after the last sample, in ms (contract AU7). */
export const PASS_RETURN_MS = 200;
/** Samples within this share of the target range are thinned away. */
export const PASS_TOLERANCE_RATIO = 0.005;

interface Pass {
  trackId: string;
  param: RecordedParam;
  mode: AutomationMode;
  startMs: number;
  samples: AutomationSample[];
  value: number;
}

/** The audio graph's side of a pass: the control's value replaces the lane. */
export interface MixerOverrideSink {
  setMixerOverride(trackId: string, param: RecordedParam, value: number | null): void;
}

const passKey = (trackId: string, param: RecordedParam) => `${trackId}:${param}`;
const PARAMS: readonly RecordedParam[] = ["volumeDb", "pan"];

function clampValue(param: RecordedParam, value: number): number {
  if (!Number.isFinite(value)) return 0;
  // One range for the recorder and the lane editor (contract AU3 mapping).
  const range = MIXER_RANGE[param];
  return Math.min(range.max, Math.max(range.min, value));
}

const isRecordable = (type: string) => type === "audio" || type === "midi";

export class AutomationRecorder {
  private passes = new Map<string, Pass>();
  private listeners = new Set<() => void>();
  private lastMs = 0;
  private prevMs = 0;
  private unsubscribers: Array<() => void> = [];
  /** True from the start of Write passes until the end of that synchronous turn. */
  private writeJustStarted = false;

  constructor(
    private readonly doc: TimelineStoreApi,
    private readonly playback: TimelinePlaybackStoreApi,
    private readonly sink: () => MixerOverrideSink | null = () =>
      playback.getState().audioGraph
  ) {
    this.attach();
  }

  /** Subscribe to the transport and the document. Safe to call again after `dispose`. */
  attach(): void {
    if (this.unsubscribers.length > 0) return;
    const start = this.playback.getState();
    this.lastMs = this.prevMs = start.getTimeMs();
    this.unsubscribers.push(
      start.subscribeTime((timeMs) => {
        this.prevMs = this.lastMs;
        this.lastMs = timeMs;
      })
    );
    this.unsubscribers.push(
      this.playback.subscribe((state, prev) => this.onTransport(state, prev))
    );
    this.unsubscribers.push(
      this.doc.subscribe((state, prev) => {
        if (this.passes.size === 0 || state.tracks === prev.tracks) return;
        this.reconcileWithDocument();
      })
    );
  }

  private onTransport(
    state: ReturnType<TimelinePlaybackStoreApi["getState"]>,
    prev: ReturnType<TimelinePlaybackStoreApi["getState"]>
  ): void {
    if (state.isPlaying !== prev.isPlaying) {
      if (state.isPlaying) {
        this.startWritePasses();
      } else {
        // Stop publishes time 0 just before this change. Pause does not
        // publish, so the last frame is the playhead.
        const stopped = state.currentTimeMs === 0 && this.lastMs === 0 && this.prevMs > 0;
        this.endAll(stopped ? this.prevMs : this.lastMs);
      }
      return;
    }
    if (!state.isPlaying || this.passes.size === 0) return;
    // A jump is a seek or a playhead write. Steady playback only publishes
    // the transient clock, which leaves both fields alone. The jump
    // published its time just before this change, so `prevMs` is the frame
    // before the move.
    if (state.seekNonce === prev.seekNonce && state.currentTimeMs === prev.currentTimeMs) return;
    // A seek to where the playhead already is (a restart at a new rate) moves nothing.
    if (Math.abs(this.lastMs - this.prevMs) < 1) return;
    if (this.writeJustStarted) {
      // Shuttle plays and seeks in one turn: the passes begin at the new time.
      this.cancel([...this.passes.values()]);
      this.startWritePasses();
      return;
    }
    // Reverse playback reaching the start pauses there: the pass ends at 0.
    this.endAll(state.rate < 0 && this.lastMs <= 0 ? 0 : this.prevMs);
  }

  /** Release every override and drop every pass without writing. */
  dispose(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.cancel([...this.passes.values()]);
  }

  private reconcileWithDocument(): void {
    const tracks = this.doc.getState().tracks;
    const cancelled: Pass[] = [];
    const ended: Pass[] = [];
    for (const pass of this.passes.values()) {
      const track = tracks.find((t) => t.id === pass.trackId);
      if (!track || track.locked || !isRecordable(track.type)) {
        cancelled.push(pass);
      } else if (automationModeOf(track) !== pass.mode) {
        ended.push(pass);
      }
    }
    if (cancelled.length > 0) this.cancel(cancelled);
    if (ended.length > 0) this.finish(ended, this.nowMs());
  }

  private cancel(passes: Pass[]): void {
    for (const pass of passes) {
      this.passes.delete(passKey(pass.trackId, pass.param));
      this.sink()?.setMixerOverride(pass.trackId, pass.param, null);
    }
    if (passes.length > 0) this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The value a running pass holds for the control, or undefined without a pass. */
  liveValue(trackId: string, param: RecordedParam): number | undefined {
    return this.passes.get(passKey(trackId, param))?.value;
  }

  /** Whether any pass runs. */
  get recording(): boolean {
    return this.passes.size > 0;
  }

  /** The user pressed a control. Touch and Latch start a pass here. */
  gestureStart(trackId: string, param: RecordedParam, value: number): void {
    if (!this.playback.getState().isPlaying) return;
    if (this.passes.has(passKey(trackId, param))) return;
    const track = this.doc.getState().tracks.find((t) => t.id === trackId);
    if (!track || track.locked || !isRecordable(track.type)) return;
    const mode = automationModeOf(track);
    if (mode !== "touch" && mode !== "latch") return;
    // The pass opens at what the track plays: the lane's value at the
    // playhead, so pressing the control does not jump the audio.
    const lane = findAutomationLane(track, { kind: "mixer", param });
    const timeMs = this.nowMs();
    const seed =
      lane && lane.points.length > 0 && isAutomationLaneActive(lane)
        ? automationValueAt(lane.points, timeMs)
        : value;
    this.startPass(trackId, param, mode, clampValue(param, seed), timeMs);
  }

  /**
   * One value typed or stepped without a drag. Returns true when a pass took
   * it. Touch records it as a short pass, Latch keeps its pass open.
   */
  commit(trackId: string, param: RecordedParam, value: number): boolean {
    this.gestureStart(trackId, param, value);
    const took = this.record(trackId, param, value);
    this.gestureEnd(trackId, param);
    return took;
  }

  /**
   * The control changed to `value`. Returns true when a pass took it, which
   * tells the control not to write the track.
   */
  record(trackId: string, param: RecordedParam, value: number): boolean {
    const pass = this.passes.get(passKey(trackId, param));
    if (!pass) return false;
    const next = clampValue(param, value);
    pass.value = next;
    const timeMs = this.nowMs();
    const last = pass.samples[pass.samples.length - 1];
    if (last && last.timeMs === timeMs) {
      last.value = next;
    } else {
      pass.samples.push({ timeMs, value: next });
    }
    this.sink()?.setMixerOverride(trackId, param, next);
    this.emit();
    return true;
  }

  /** The user released a control. Touch ends its pass here. */
  gestureEnd(trackId: string, param: RecordedParam): void {
    const pass = this.passes.get(passKey(trackId, param));
    if (pass && pass.mode === "touch") this.finish([pass], this.nowMs());
  }

  private nowMs(): number {
    return Math.max(0, this.playback.getState().getTimeMs());
  }

  private startWritePasses(): void {
    const timeMs = this.nowMs();
    for (const track of this.doc.getState().tracks) {
      if (track.locked || !isRecordable(track.type)) continue;
      if (automationModeOf(track) !== "write") continue;
      for (const param of PARAMS) {
        this.startPass(track.id, param, "write", clampValue(param, track[param] ?? 0), timeMs);
        if (!this.writeJustStarted) {
          this.writeJustStarted = true;
          queueMicrotask(() => {
            this.writeJustStarted = false;
          });
        }
      }
    }
  }

  private startPass(
    trackId: string,
    param: RecordedParam,
    mode: AutomationMode,
    value: number,
    timeMs: number = this.nowMs()
  ): void {
    this.passes.set(passKey(trackId, param), {
      trackId,
      param,
      mode,
      startMs: timeMs,
      samples: [{ timeMs, value }],
      value
    });
    this.sink()?.setMixerOverride(trackId, param, value);
    this.emit();
  }

  private endAll(endMs: number): void {
    if (this.passes.size === 0) return;
    this.finish([...this.passes.values()], endMs);
  }

  /** End `passes` at `endMs`: one undo entry for all of them. */
  private finish(passes: Pass[], endMs: number): void {
    for (const pass of passes) {
      this.passes.delete(passKey(pass.trackId, pass.param));
      this.sink()?.setMixerOverride(pass.trackId, pass.param, null);
    }
    runAsOneUndoEntry(this.doc, () => {
      for (const pass of passes) this.write(pass, endMs);
    });
    this.emit();
  }

  private write(pass: Pass, endMsRaw: number): void {
    const state = this.doc.getState();
    const track = state.tracks.find((t) => t.id === pass.trackId);
    if (!track) return;
    // Reverse playback ends before it starts: the pass covers both times.
    const lo = Math.min(pass.startMs, endMsRaw);
    const hi = Math.max(pass.startMs, endMsRaw);
    const clamped = [...pass.samples, { timeMs: endMsRaw, value: pass.value }]
      .map((s) => ({ timeMs: Math.min(hi, Math.max(lo, s.timeMs)), value: s.value }))
      .sort((a, b) => a.timeMs - b.timeMs);
    // One point per time: the later sample wins.
    const samples: AutomationSample[] = [];
    for (const sample of clamped) {
      const last = samples[samples.length - 1];
      if (last && last.timeMs === sample.timeMs) {
        last.value = sample.value;
      } else {
        samples.push(sample);
      }
    }
    const target: AutomationTarget = { kind: "mixer", param: pass.param };
    const range = MIXER_RANGE[pass.param];
    const lane = findAutomationLane(track, target);
    const points = writeAutomationPass(
      lane?.points ?? [],
      { startMs: lo, endMs: hi, samples },
      track[pass.param] ?? 0,
      PASS_RETURN_MS,
      (range.max - range.min) * PASS_TOLERANCE_RATIO
    );
    const lanes = track.automation ?? [];
    let written: AutomationLane;
    if (lane) {
      // A pass into a lane that was off turns it on, so the take plays back.
      written = { ...lane, points };
      delete written.enabled;
    } else {
      written = { ...createAutomationLane(target), points };
    }
    state.setTrackAutomation(
      track.id,
      lane ? lanes.map((l) => (l === lane ? written : l)) : [...lanes, written]
    );
    // A mode the user chose during the pass stays.
    if (pass.mode === "write" && automationModeOf(track) === "write") state.setTrackAutomationMode(track.id, "latch");
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const recorders = new WeakMap<TimelineStoreApi, AutomationRecorder>();

/** The recorder of a timeline instance, created on first use. */
export function getAutomationRecorder(
  doc: TimelineStoreApi,
  playback: TimelinePlaybackStoreApi
): AutomationRecorder {
  let recorder = recorders.get(doc);
  if (!recorder) {
    recorder = new AutomationRecorder(doc, playback);
    recorders.set(doc, recorder);
  }
  return recorder;
}

/** The recorder of the active timeline instance. */
export function useAutomationRecorder(): AutomationRecorder {
  return getAutomationRecorder(useTimelineStoreApi(), useTimelinePlaybackStoreApi());
}

/** The value a recording pass holds for a control, or undefined. */
export function useAutomationLiveValue(
  trackId: string,
  param: RecordedParam | null
): number | undefined {
  const recorder = useAutomationRecorder();
  return useSyncExternalStore(
    recorder.subscribe,
    () => (param === null ? undefined : recorder.liveValue(trackId, param)),
    () => undefined
  );
}
