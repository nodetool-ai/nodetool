import type { GameStepTimings } from "@nodetool-ai/protocol";
import type { GameStepPhysicsStats, GameStepResult } from "@nodetool-ai/game-runtime";

type GameScriptStats = NonNullable<GameStepResult["scriptStats"]>;

/** One simulation tick as the profiler records it. Every field except `tick` is absent when its source did not report. */
export interface GameProfileSample {
  readonly tick: number;
  /** Wall time between the two latest rendered frames, absent after a pause. */
  readonly frameMs?: number;
  /** CPU time of the whole simulation step. */
  readonly stepMs?: number;
  /** CPU time per simulation system, in pipeline order. */
  readonly systems?: GameStepTimings["systems"];
  readonly scriptMs?: number;
  readonly scriptCalls?: number;
  readonly scriptsByEntity?: GameScriptStats["byEntity"];
  readonly drawCalls?: number;
  readonly triangles?: number;
  readonly textureBytes?: number;
  readonly geometryBytes?: number;
  readonly bodies?: number;
  readonly contacts?: number;
  readonly voices?: number;
}

/** What a play session hands the profiler after each step. */
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

export interface GameProfileCapture {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly samples: readonly GameProfileSample[];
  /** True when the capture ran longer than the buffer holds, so its oldest samples were dropped. */
  readonly truncated: boolean;
}

/** Fixed-capacity buffer that overwrites its oldest item. Pushing never allocates after the buffer fills. */
export class GameProfileRingBuffer<Item> {
  private readonly items: (Item | undefined)[];
  private start = 0;
  private count = 0;
  private dropped = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) { throw new Error("Ring buffer capacity must be a positive integer"); }
    this.items = new Array<Item | undefined>(capacity);
  }

  get size(): number { return this.count; }

  /** Items overwritten since the last clear. */
  get overwritten(): number { return this.dropped; }

  push(item: Item): void {
    if (this.count < this.capacity) {
      this.items[(this.start + this.count) % this.capacity] = item;
      this.count += 1;
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
    this.dropped += 1;
  }

  /** The items from oldest to newest. */
  toArray(): Item[] {
    const result: Item[] = [];
    for (let index = 0; index < this.count; index++) {
      const item = this.items[(this.start + index) % this.capacity];
      if (item !== undefined) { result.push(item); }
    }
    return result;
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
    this.dropped = 0;
  }
}

/** Ten seconds at 60 ticks per second. */
export const GAME_PROFILER_LIVE_SAMPLES = 600;
/** Ten minutes at 60 ticks per second. */
export const GAME_PROFILER_CAPTURE_SAMPLES = 36_000;
/** A longer gap between rendered frames is a pause, not a slow frame. */
const FRAME_GAP_MS = 1000;

/**
 * Collects profile samples from a play session outside React. Sessions record only while a profiler view is
 * attached or a capture runs, and views poll `version` at their own rate, so a running game does not re-render
 * the editor once per tick. It reads step results and renderer statistics and never touches the session.
 */
export interface GameProfiler {
  /** True while samples are kept. Sessions check it before gathering anything costly. */
  readonly recording: () => boolean;
  readonly recordStep: (step: GameProfilerStep) => void;
  readonly recordRender: (stats: GameProfilerRender, now?: number) => void;
  /** Keeps recording on while the returned function has not been called. */
  readonly attach: () => () => void;
  /** Increases with every recorded sample and every capture or clear. */
  readonly version: () => number;
  readonly samples: () => readonly GameProfileSample[];
  readonly startCapture: (now?: number) => void;
  readonly stopCapture: (now?: number) => GameProfileCapture | null;
  readonly capturing: () => boolean;
  /** The last finished capture. */
  readonly capture: () => GameProfileCapture | null;
  readonly clear: () => void;
}

export function createGameProfiler(liveCapacity = GAME_PROFILER_LIVE_SAMPLES, captureCapacity = GAME_PROFILER_CAPTURE_SAMPLES): GameProfiler {
  const live = new GameProfileRingBuffer<GameProfileSample>(liveCapacity);
  const captured = new GameProfileRingBuffer<GameProfileSample>(captureCapacity);
  let attached = 0;
  let version = 0;
  let captureStartedAt: number | null = null;
  let finished: GameProfileCapture | null = null;
  let render: GameProfilerRender | null = null;
  let lastRenderAt: number | null = null;
  let frameMs: number | undefined;
  const recording = (): boolean => attached > 0 || captureStartedAt !== null;
  return {
    recording,
    recordStep(step) {
      if (!recording()) { return; }
      const sample: { -readonly [Key in keyof GameProfileSample]: GameProfileSample[Key] } = { tick: step.tick };
      if (frameMs !== undefined) { sample.frameMs = frameMs; }
      if (step.timings) {
        sample.stepMs = step.timings.totalMs;
        sample.systems = step.timings.systems;
      }
      if (step.scriptStats) {
        sample.scriptMs = step.scriptStats.durationMs;
        sample.scriptCalls = step.scriptStats.calls;
        sample.scriptsByEntity = step.scriptStats.byEntity;
      }
      if (render) {
        sample.drawCalls = render.drawCalls;
        sample.textureBytes = render.textureBytes;
        if (render.triangles !== undefined) { sample.triangles = render.triangles; }
        if (render.geometryBytes !== undefined) { sample.geometryBytes = render.geometryBytes; }
      }
      if (step.physics) {
        sample.bodies = step.physics.bodies;
        sample.contacts = step.physics.contacts;
      }
      if (step.voices !== undefined) { sample.voices = step.voices; }
      live.push(sample);
      if (captureStartedAt !== null) { captured.push(sample); }
      version += 1;
    },
    recordRender(stats, now = performance.now()) {
      if (!recording()) {
        lastRenderAt = null;
        return;
      }
      frameMs = lastRenderAt !== null && now - lastRenderAt <= FRAME_GAP_MS ? now - lastRenderAt : undefined;
      lastRenderAt = now;
      render = stats;
    },
    attach() {
      attached += 1;
      let detached = false;
      return () => {
        if (detached) { return; }
        detached = true;
        attached -= 1;
      };
    },
    version: () => version,
    samples: () => live.toArray(),
    startCapture(now = Date.now()) {
      captured.clear();
      captureStartedAt = now;
      finished = null;
      version += 1;
    },
    stopCapture(now = Date.now()) {
      if (captureStartedAt === null) { return finished; }
      finished = { startedAt: captureStartedAt, endedAt: now, samples: captured.toArray(), truncated: captured.overwritten > 0 };
      captureStartedAt = null;
      captured.clear();
      version += 1;
      return finished;
    },
    capturing: () => captureStartedAt !== null,
    capture: () => finished,
    clear() {
      live.clear();
      captured.clear();
      finished = null;
      if (captureStartedAt !== null) { captureStartedAt = Date.now(); }
      render = null;
      lastRenderAt = null;
      frameMs = undefined;
      version += 1;
    }
  };
}
