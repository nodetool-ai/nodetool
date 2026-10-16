import type { GameStepTimings } from "@nodetool-ai/protocol";
import type { GameStepPhysicsStats, GameStepResult } from "@nodetool-ai/game-runtime";

type GameScriptStats = NonNullable<GameStepResult["scriptStats"]>;

/** What a play session hands the profiler after each simulation step. */
export interface GameProfilerStep {
  readonly tick: number;
  readonly timings?: GameStepTimings;
  readonly scriptStats?: GameScriptStats;
  readonly physics?: GameStepPhysicsStats;
  readonly voices?: number;
}

/** What a play session hands the profiler after each rendered frame. Both renderers report draw calls and texture memory. */
export interface GameProfilerRender {
  readonly drawCalls: number;
  readonly textureBytes: number;
  readonly triangles?: number;
  readonly geometryBytes?: number;
}

export const GAME_PROFILE_STEP_METRICS = ["tick", "stepMs", "scriptMs", "scriptCalls", "bodies", "contacts", "voices"] as const;
export const GAME_PROFILE_FRAME_METRICS = ["frameMs", "drawCalls", "triangles", "textureBytes", "geometryBytes"] as const;
export type GameProfileStepMetric = typeof GAME_PROFILE_STEP_METRICS[number];
export type GameProfileFrameMetric = typeof GAME_PROFILE_FRAME_METRICS[number];

/** Script time of one entity, summed over the ticks it ran. */
export interface GameProfileScriptTotal {
  readonly entityId: string;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly calls: number;
}

/** Recorded columns in time order. A missing value is NaN. */
export interface GameProfileData {
  readonly steps: Readonly<Record<GameProfileStepMetric, Float32Array>>;
  readonly systems: readonly { readonly system: string; readonly values: Float32Array }[];
  readonly frames: Readonly<Record<GameProfileFrameMetric, Float32Array>>;
  /** Entities with the most script time first. The last row collects entities past the table's limit. */
  readonly scripts: readonly GameProfileScriptTotal[];
  /** Ticks that reported script stats, the divisor for an entity's mean script time per tick. */
  readonly scriptTicks: number;
  /** Wall-clock times of the first and last recorded step, in ms since the epoch. */
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

export interface GameProfileCapture {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly data: GameProfileData;
  /** True when the capture filled its buffers and stopped by itself. */
  readonly full: boolean;
}

/** Ten seconds at 60 ticks per second. */
export const GAME_PROFILER_LIVE_TICKS = 600;
/** Ten minutes at 60 ticks per second. */
export const GAME_PROFILER_CAPTURE_TICKS = 36_000;
/** Rendered frames a capture holds: two per tick covers a 120 Hz display at a 60 Hz tick rate. */
export const GAME_PROFILER_CAPTURE_FRAMES = 72_000;
/** Systems beyond this many are not recorded. Engines run fewer than ten. */
export const GAME_PROFILER_MAX_SYSTEMS = 16;
/** Entities beyond this many share one script-time row. */
export const GAME_PROFILER_MAX_SCRIPT_ENTITIES = 1024;
/** Entity ids are counted at this many characters at most when estimating memory. Longer ids are truncated in the table. */
const MAX_ID_LENGTH = 128;
export const GAME_PROFILER_OTHER_ENTITIES = "(other entities)";
/** The upper bound of a capture's memory, whatever the entity count. `GameProfileBuffer.bytes()` stays below it. */
export const GAME_PROFILER_CAPTURE_BYTE_LIMIT = 8 * 1024 * 1024;

/** Float32 columns in a ring. Without `overwrite` it stops accepting rows when full. */
class ColumnRing {
  private readonly columns = new Map<string, Float32Array>();
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number, keys: readonly string[], private readonly overwrite: boolean, private readonly maxColumns: number) {
    for (const key of keys) { this.columns.set(key, new Float32Array(capacity).fill(Number.NaN)); }
  }

  get size(): number { return this.count; }
  get full(): boolean { return this.count === this.capacity; }

  /** Claims the next row, or returns -1 when the ring is full and does not overwrite. */
  claim(): number {
    if (this.count < this.capacity) {
      const row = (this.start + this.count) % this.capacity;
      this.count += 1;
      for (const column of this.columns.values()) { column[row] = Number.NaN; }
      return row;
    }
    if (!this.overwrite) { return -1; }
    const row = this.start;
    this.start = (this.start + 1) % this.capacity;
    for (const column of this.columns.values()) { column[row] = Number.NaN; }
    return row;
  }

  set(key: string, row: number, value: number): void {
    let column = this.columns.get(key);
    if (!column) {
      if (this.columns.size >= this.maxColumns) { return; }
      column = new Float32Array(this.capacity).fill(Number.NaN);
      this.columns.set(key, column);
    }
    column[row] = value;
  }

  keys(): string[] { return [...this.columns.keys()]; }

  /** The column's rows from oldest to newest, as a copy. */
  read(key: string): Float32Array {
    const column = this.columns.get(key);
    const result = new Float32Array(this.count).fill(Number.NaN);
    if (!column) { return result; }
    const head = Math.min(this.count, this.capacity - this.start);
    result.set(column.subarray(this.start, this.start + head));
    result.set(column.subarray(0, this.count - head), head);
    return result;
  }

  bytes(): number { return this.columns.size * this.capacity * Float32Array.BYTES_PER_ELEMENT; }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}

/** Running script-time totals per entity in typed arrays indexed by an entity table of bounded size. */
class ScriptTotals {
  private readonly index = new Map<string, number>();
  private readonly ids: string[] = [];
  private readonly totals = new Float64Array(GAME_PROFILER_MAX_SCRIPT_ENTITIES + 1);
  private readonly maxes = new Float64Array(GAME_PROFILER_MAX_SCRIPT_ENTITIES + 1);
  private readonly calls = new Float64Array(GAME_PROFILER_MAX_SCRIPT_ENTITIES + 1);
  ticks = 0;

  add(byEntity: GameScriptStats["byEntity"]): void {
    this.ticks += 1;
    for (const entityId in byEntity) {
      const stats = byEntity[entityId];
      let slot = this.index.get(entityId);
      if (slot === undefined) {
        slot = this.ids.length < GAME_PROFILER_MAX_SCRIPT_ENTITIES ? this.ids.length : GAME_PROFILER_MAX_SCRIPT_ENTITIES;
        if (slot < GAME_PROFILER_MAX_SCRIPT_ENTITIES) {
          this.ids.push(entityId.slice(0, MAX_ID_LENGTH));
          this.index.set(entityId, slot);
        }
      }
      this.totals[slot] += stats.durationMs;
      this.maxes[slot] = Math.max(this.maxes[slot], stats.durationMs);
      this.calls[slot] += stats.calls;
    }
  }

  rows(): GameProfileScriptTotal[] {
    const rows = this.ids.map((entityId, slot) => ({ entityId, totalMs: this.totals[slot], maxMs: this.maxes[slot], calls: this.calls[slot] }));
    rows.sort((left, right) => right.totalMs - left.totalMs || left.entityId.localeCompare(right.entityId));
    const other = GAME_PROFILER_MAX_SCRIPT_ENTITIES;
    if (this.calls[other] > 0) {
      rows.push({ entityId: GAME_PROFILER_OTHER_ENTITIES, totalMs: this.totals[other], maxMs: this.maxes[other], calls: this.calls[other] });
    }
    return rows;
  }

  bytes(): number {
    // Three typed arrays, the table's ids as UTF-16 with a string header each, and a map entry per id.
    return 3 * this.totals.byteLength + this.ids.length * (2 * MAX_ID_LENGTH + 32 + 64);
  }

  clear(): void {
    this.index.clear();
    this.ids.length = 0;
    this.totals.fill(0);
    this.maxes.fill(0);
    this.calls.fill(0);
    this.ticks = 0;
  }
}

const SYSTEM_KEY = "system:";

/**
 * Step and frame columns in Float32 typed arrays, with running script totals per entity. Its memory is fixed by
 * its capacities, so it does not grow with the entity count or the number of scripts.
 */
export class GameProfileBuffer {
  private readonly steps: ColumnRing;
  private readonly frames: ColumnRing;
  private readonly scripts = new ScriptTotals();
  private startedAt: number | null = null;
  private endedAt: number | null = null;

  constructor(tickCapacity: number, frameCapacity: number, overwrite: boolean) {
    if (![tickCapacity, frameCapacity].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error("Profile buffer capacities must be positive integers");
    }
    this.steps = new ColumnRing(tickCapacity, GAME_PROFILE_STEP_METRICS, overwrite, GAME_PROFILE_STEP_METRICS.length + GAME_PROFILER_MAX_SYSTEMS);
    this.frames = new ColumnRing(frameCapacity, GAME_PROFILE_FRAME_METRICS, overwrite, GAME_PROFILE_FRAME_METRICS.length);
  }

  /** True when a buffer that does not overwrite has no room for another step or frame. */
  get full(): boolean { return this.steps.full || this.frames.full; }
  get ticks(): number { return this.steps.size; }

  addStep(step: GameProfilerStep, now: number): boolean {
    const row = this.steps.claim();
    if (row < 0) { return false; }
    this.startedAt ??= now;
    this.endedAt = now;
    this.steps.set("tick", row, step.tick);
    if (step.timings) {
      this.steps.set("stepMs", row, step.timings.totalMs);
      for (const timing of step.timings.systems) { this.steps.set(SYSTEM_KEY + timing.system, row, timing.durationMs); }
    }
    if (step.scriptStats) {
      this.steps.set("scriptMs", row, step.scriptStats.durationMs);
      this.steps.set("scriptCalls", row, step.scriptStats.calls);
      this.scripts.add(step.scriptStats.byEntity);
    }
    if (step.physics) {
      this.steps.set("bodies", row, step.physics.bodies);
      this.steps.set("contacts", row, step.physics.contacts);
    }
    if (step.voices !== undefined) { this.steps.set("voices", row, step.voices); }
    return true;
  }

  addFrame(frameMs: number | undefined, stats: GameProfilerRender): boolean {
    const row = this.frames.claim();
    if (row < 0) { return false; }
    if (frameMs !== undefined) { this.frames.set("frameMs", row, frameMs); }
    this.frames.set("drawCalls", row, stats.drawCalls);
    this.frames.set("textureBytes", row, stats.textureBytes);
    if (stats.triangles !== undefined) { this.frames.set("triangles", row, stats.triangles); }
    if (stats.geometryBytes !== undefined) { this.frames.set("geometryBytes", row, stats.geometryBytes); }
    return true;
  }

  data(): GameProfileData {
    const steps = Object.fromEntries(GAME_PROFILE_STEP_METRICS.map((key) => [key, this.steps.read(key)])) as Record<GameProfileStepMetric, Float32Array>;
    const frames = Object.fromEntries(GAME_PROFILE_FRAME_METRICS.map((key) => [key, this.frames.read(key)])) as Record<GameProfileFrameMetric, Float32Array>;
    const systems = this.steps.keys().filter((key) => key.startsWith(SYSTEM_KEY))
      .map((key) => ({ system: key.slice(SYSTEM_KEY.length), values: this.steps.read(key) }));
    return { steps, systems, frames, scripts: this.scripts.rows(), scriptTicks: this.scripts.ticks, startedAt: this.startedAt, endedAt: this.endedAt };
  }

  /** Memory held by the buffer's columns and entity table. */
  bytes(): number { return this.steps.bytes() + this.frames.bytes() + this.scripts.bytes(); }

  /** The most a buffer of these capacities can hold, with every system column and a full entity table. */
  static maxBytes(tickCapacity: number, frameCapacity: number): number {
    const columns = (GAME_PROFILE_STEP_METRICS.length + GAME_PROFILER_MAX_SYSTEMS) * tickCapacity + GAME_PROFILE_FRAME_METRICS.length * frameCapacity;
    return columns * Float32Array.BYTES_PER_ELEMENT + 3 * (GAME_PROFILER_MAX_SCRIPT_ENTITIES + 1) * Float64Array.BYTES_PER_ELEMENT
      + GAME_PROFILER_MAX_SCRIPT_ENTITIES * (2 * MAX_ID_LENGTH + 32 + 64);
  }

  clear(): void {
    this.steps.clear();
    this.frames.clear();
    this.scripts.clear();
    this.startedAt = null;
    this.endedAt = null;
  }
}

/**
 * Collects profile data from a play session outside React. Sessions record only while a profiler view is
 * attached or a capture runs, and views poll `version` at their own rate, so a running game does not re-render
 * the editor once per tick. It reads step results and renderer statistics and never touches the session.
 */
export interface GameProfiler {
  /** True while data is kept. Sessions read it before gathering anything, and as their `recordTimings` option. */
  readonly recording: () => boolean;
  readonly recordStep: (step: GameProfilerStep, now?: number) => void;
  readonly recordRender: (stats: GameProfilerRender, now?: number) => void;
  /** Paused renders retain resource statistics without adding a playback interval. */
  readonly setPlaybackActive: (active: boolean) => void;
  /** Keeps recording on while the returned function has not been called. */
  readonly attach: () => () => void;
  /** Increases with every recorded step, completed render, capture or clear. */
  readonly version: () => number;
  /** The live window: the newest ticks and frames, up to its capacity. */
  readonly live: () => GameProfileData;
  readonly startCapture: (now?: number) => void;
  readonly stopCapture: (now?: number) => GameProfileCapture | null;
  readonly capturing: () => boolean;
  /** The last finished capture, including one that stopped because it was full. */
  readonly capture: () => GameProfileCapture | null;
  /** Empties the live window. A new play session calls it. */
  readonly clearLive: () => void;
  /** Empties the live window and discards the capture. */
  readonly clear: () => void;
}

export function createGameProfiler(liveTicks = GAME_PROFILER_LIVE_TICKS, captureTicks = GAME_PROFILER_CAPTURE_TICKS,
  captureFrames = GAME_PROFILER_CAPTURE_FRAMES): GameProfiler {
  const live = new GameProfileBuffer(liveTicks, liveTicks, true);
  let captured: GameProfileBuffer | null = null;
  let attached = 0;
  let version = 0;
  let captureStartedAt: number | null = null;
  let finished: GameProfileCapture | null = null;
  let lastRenderAt: number | null = null;
  let playbackActive = true;
  const recording = (): boolean => attached > 0 || captureStartedAt !== null;
  const finish = (now: number, full: boolean): GameProfileCapture | null => {
    if (captureStartedAt === null || !captured) { return finished; }
    finished = { startedAt: captureStartedAt, endedAt: now, data: captured.data(), full };
    captureStartedAt = null;
    captured = null;
    if (!recording()) { lastRenderAt = null; }
    version += 1;
    return finished;
  };
  return {
    recording,
    recordStep(step, now = Date.now()) {
      if (!recording()) { return; }
      live.addStep(step, now);
      if (captured && !captured.addStep(step, now)) { finish(now, true); }
      version += 1;
    },
    recordRender(stats, now = performance.now()) {
      if (!recording()) {
        lastRenderAt = null;
        return;
      }
      const frameMs = playbackActive && lastRenderAt !== null ? now - lastRenderAt : undefined;
      lastRenderAt = playbackActive ? now : null;
      live.addFrame(frameMs, stats);
      if (captured && !captured.addFrame(frameMs, stats)) { finish(Date.now(), true); }
      version += 1;
    },
    setPlaybackActive(active) {
      if (playbackActive !== active) { lastRenderAt = null; }
      playbackActive = active;
    },
    attach() {
      attached += 1;
      let detached = false;
      return () => {
        if (detached) { return; }
        detached = true;
        attached -= 1;
        if (!recording()) { lastRenderAt = null; }
      };
    },
    version: () => version,
    live: () => live.data(),
    startCapture(now = Date.now()) {
      captured = new GameProfileBuffer(captureTicks, captureFrames, false);
      captureStartedAt = now;
      finished = null;
      version += 1;
    },
    stopCapture: (now = Date.now()) => finish(now, false),
    capturing: () => captureStartedAt !== null,
    capture: () => finished,
    clearLive() {
      live.clear();
      lastRenderAt = null;
      version += 1;
    },
    clear() {
      live.clear();
      captured?.clear();
      if (captureStartedAt !== null) { captureStartedAt = Date.now(); }
      finished = null;
      lastRenderAt = null;
      version += 1;
    }
  };
}
