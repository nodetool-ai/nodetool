/**
 * Decoded video frames for one clip's use of one asset, pulled from a
 * WebCodecs decoder by source time (design D4, D5, D7).
 *
 * The compositor asks {@link DecodedFrameSource.frameAt} for the frame that
 * belongs to the clock and never waits for it. While playing it calls
 * {@link DecodedFrameSource.advance} so frames are decoded ahead of the clock.
 * While paused it awaits {@link DecodedFrameSource.seek} in `exact` mode and
 * redraws when the frame lands.
 */
import {
  TIMESTAMP_EPSILON_SEC,
  frameStartsBy,
  needsDecodeRestart,
  selectFrameIndex
} from "../render/clipDecoder";
import { emitTimelinePreviewDiagnostic } from "./gpu/previewDiagnostics";

/** One decoded sample, as mediabunny's `VideoSample` provides it. */
export interface FrameSample {
  readonly timestamp: number;
  readonly duration: number;
  toVideoFrame(): VideoFrame;
  close(): void;
}

/** The decoder calls a source makes, as mediabunny's `VideoSampleSink` provides them. */
export interface FrameSampleSink {
  samples(startSec: number): AsyncGenerator<FrameSample, void, unknown>;
  getSample(sec: number): Promise<FrameSample | null>;
}

export interface DecodedFrameSourceOptions {
  /** Diagnostics id, the pool key of the clip and asset. */
  id: string;
  width: number;
  height: number;
  /** A sink on the asset's track. `preferSoftware` is the retry after a decode error. */
  createSink: (preferSoftware: boolean) => FrameSampleSink;
  /**
   * A decode failed. `beforeFirstFrame` means the clip has drawn nothing yet
   * and may still move to the element path (D2). Later failures hold the last
   * frame.
   */
  onError: (error: unknown, beforeFirstFrame: boolean) => void;
  /** Releases the demuxer after the source is disposed. */
  onDispose?: () => void;
}

/** Most decoded frames held ahead of the clock (D5). */
const MAX_AHEAD_FRAMES = 8;
/** Longest decode-ahead window in clock seconds (D5). */
const MAX_AHEAD_SEC = 0.25;
/** Most `VideoFrame`s one source holds open, the drawn frame included (D5, R1). */
export const MAX_OPEN_FRAMES = 10;

interface QueuedFrame {
  sec: number;
  durationSec: number;
  frame: VideoFrame;
  /** The decode generation that produced the frame. */
  generation: number;
}

let openFrames = 0;

/** `VideoFrame`s open across every decoded source, for leak checks (R3). */
export function openDecodedFrameCount(): number {
  return openFrames;
}

function closeFrame(entry: QueuedFrame): void {
  entry.frame.close();
  openFrames -= 1;
}

interface ExactWaiter {
  sec: number;
  resolve: () => void;
}

export class DecodedFrameSource {
  readonly width: number;
  readonly height: number;
  private readonly id: string;
  private readonly options: DecodedFrameSourceOptions;
  private sink: FrameSampleSink;
  private preferSoftware = false;
  /** Decoded frames after the drawn one, in presentation order. */
  private queue: QueuedFrame[] = [];
  /** The frame `frameAt` returned last. Held so a late tick draws it again. */
  private shown: QueuedFrame | null = null;
  private iterator: AsyncGenerator<FrameSample, void, unknown> | null = null;
  /** Bumped on every restart, so a stale decode result is dropped. */
  private generation = 0;
  private restartSec = 0;
  private ended = false;
  private targetSec = 0;
  private rate = 1;
  private pumping = false;
  private wakePump: (() => void) | null = null;
  private waiters: ExactWaiter[] = [];
  private randomTargetSec: number | null = null;
  private randomBusy = false;
  private randomIdle: Array<() => void> = [];
  private decodedAny = false;
  private failed = false;
  private disposed = false;

  constructor(options: DecodedFrameSourceOptions) {
    this.options = options;
    this.id = options.id;
    this.width = options.width;
    this.height = options.height;
    this.sink = options.createSink(false);
  }

  /**
   * The timestamp of the frame {@link frameAt} would return for
   * `sourceSec`, without consuming the queue. The playback tick redraws only
   * when it changes, so a 30 fps clip on a 60 Hz display composites 30 times
   * a second.
   */
  peekFrameSec(sourceSec: number): number | null {
    const index = selectFrameIndex(
      this.queue.map((entry) => entry.sec),
      sourceSec
    );
    if (index >= 0) return this.queue[index].sec;
    return this.shown?.sec ?? this.queue[0]?.sec ?? null;
  }

  /** Whether a frame is available to draw. */
  hasFrame(): boolean {
    return this.shown !== null || this.queue.length > 0;
  }

  /**
   * The last decoded frame that starts at or before `sourceSec`. When none
   * has been decoded yet, the drawn frame stays; the clock never waits for
   * video (D4). Frames older than the returned one are closed.
   */
  frameAt(sourceSec: number): VideoFrame | null {
    const index = selectFrameIndex(
      this.queue.map((entry) => entry.sec),
      sourceSec
    );
    if (index >= 0) {
      const next = this.queue[index];
      for (let i = 0; i < index; i += 1) closeFrame(this.queue[i]);
      if (this.shown) closeFrame(this.shown);
      this.shown = next;
      this.queue.splice(0, index + 1);
      this.wakePump?.();
    }
    const shown = this.shown;
    if (shown) {
      if (
        shown.generation === this.generation &&
        this.queue.length === 0 &&
        !this.ended &&
        shown.sec + Math.max(shown.durationSec, 0) < sourceSec - 0.001
      ) {
        emitTimelinePreviewDiagnostic({
          kind: "frame-late",
          sourceId: this.id,
          targetSec: sourceSec,
          newestSec: shown.sec
        });
      }
      emitTimelinePreviewDiagnostic({
        kind: "frame-presented",
        sourceId: this.id,
        targetSec: sourceSec,
        frameSec: shown.sec
      });
      return shown.frame;
    }
    // Nothing drawn yet: the first decoded frame starts a hair after the
    // target (an in-point between frames). Draw it without consuming it.
    return this.queue[0]?.frame ?? null;
  }

  /**
   * Keep frames decoded ahead of `sourceSec` while playing forward at `rate`
   * source seconds per clock second.
   */
  advance(sourceSec: number, rate: number): void {
    if (this.disposed || this.failed) return;
    this.randomTargetSec = null;
    this.rate = rate;
    this.moveSequential(sourceSec);
  }

  /**
   * Move the decode position to `sourceSec`.
   *
   * `exact` resolves once the frame for `sourceSec` is decoded, or once a
   * newer request supersedes this one: the latest request wins, and the
   * caller redraws either way. `play` serves a remapped or reversed clip: a
   * short forward step decodes through, and any other move decodes the one
   * frame at `sourceSec`, with at most one decode in flight (D7).
   */
  seek(sourceSec: number, mode: "play" | "exact"): Promise<void> {
    if (this.disposed || this.failed) return Promise.resolve();
    if (mode === "play") {
      if (
        this.iterator &&
        this.randomTargetSec === null &&
        !needsDecodeRestart(this.positionSec(), sourceSec)
      ) {
        this.rate = 1;
        this.moveSequential(sourceSec);
        return Promise.resolve();
      }
      return this.decodeOne(sourceSec);
    }
    this.randomTargetSec = null;
    for (const waiter of this.waiters.splice(0)) waiter.resolve();
    this.moveSequential(sourceSec);
    if (this.exactReady(sourceSec)) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push({ sec: sourceSec, resolve });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.stopIterator();
    for (const entry of this.queue) closeFrame(entry);
    this.queue = [];
    if (this.shown) closeFrame(this.shown);
    this.shown = null;
    this.settleWaiters();
    this.wakePump?.();
    for (const idle of this.randomIdle.splice(0)) idle();
    this.options.onDispose?.();
  }

  /** Where the sequential decode stands: the drawn frame, or the restart point. */
  private positionSec(): number {
    return this.shown && this.shown.generation === this.generation
      ? this.shown.sec
      : this.restartSec;
  }

  /**
   * Point the sequential decode at `sourceSec`. A short forward step drops
   * the queued frames it passes before waking the decode, because a queue
   * full of passed frames would keep the decode asleep with nothing to
   * drain it.
   */
  private moveSequential(sourceSec: number): void {
    this.targetSec = sourceSec;
    if (!this.iterator || needsDecodeRestart(this.positionSec(), sourceSec)) {
      this.restart(sourceSec);
      return;
    }
    this.pruneBehindTarget();
    this.wakePump?.();
  }

  private restart(sourceSec: number): void {
    const fromSec = this.positionSec();
    this.generation += 1;
    this.stopIterator();
    for (const entry of this.queue) closeFrame(entry);
    this.queue = [];
    this.ended = false;
    this.restartSec = sourceSec;
    this.iterator = this.sink.samples(Math.max(0, sourceSec));
    emitTimelinePreviewDiagnostic({
      kind: "decoder-restart",
      sourceId: this.id,
      fromSec,
      toSec: sourceSec
    });
    this.startPump();
  }

  private stopIterator(): void {
    const iterator = this.iterator;
    this.iterator = null;
    if (iterator) void iterator.return(undefined).catch(() => undefined);
  }

  /** Whether the frame for `sec` is decoded and nothing later can replace it. */
  private exactReady(sec: number): boolean {
    const entries =
      this.shown && this.shown.generation === this.generation
        ? [this.shown, ...this.queue]
        : this.queue;
    const index = selectFrameIndex(
      entries.map((entry) => entry.sec),
      sec
    );
    if (index < 0) return this.ended && entries.length > 0;
    const entry = entries[index];
    return (
      index + 1 < entries.length ||
      this.ended ||
      entry.sec + entry.durationSec > sec + 0.000001
    );
  }

  private settleWaiters(): void {
    if (this.disposed || this.failed) {
      for (const waiter of this.waiters.splice(0)) waiter.resolve();
      return;
    }
    this.waiters = this.waiters.filter((waiter) => {
      if (!this.exactReady(waiter.sec)) return true;
      waiter.resolve();
      return false;
    });
  }

  /** Whether the queue reaches far enough ahead of the target. */
  private aheadFull(): boolean {
    if (this.queue.length + (this.shown ? 1 : 0) >= MAX_OPEN_FRAMES) return true;
    if (this.queue.length >= MAX_AHEAD_FRAMES) return true;
    const newest = this.queue[this.queue.length - 1];
    if (!newest) return false;
    const aheadSec = MAX_AHEAD_SEC * Math.max(1, Math.abs(this.rate));
    return newest.sec >= this.targetSec + aheadSec;
  }

  /**
   * Drop queued frames that a later queued frame already replaces for the
   * target, so a forward jump decodes through without filling the queue.
   */
  private pruneBehindTarget(): void {
    let drop = 0;
    while (
      drop + 1 < this.queue.length &&
      frameStartsBy(this.queue[drop + 1].sec, this.targetSec)
    ) {
      drop += 1;
    }
    for (let i = 0; i < drop; i += 1) closeFrame(this.queue[i]);
    if (drop > 0) this.queue.splice(0, drop);
  }

  private startPump(): void {
    if (this.pumping) {
      this.wakePump?.();
      return;
    }
    this.pumping = true;
    void this.pump().finally(() => {
      this.pumping = false;
    });
  }

  private waitForWake(): Promise<void> {
    return new Promise((resolve) => {
      this.wakePump = () => {
        this.wakePump = null;
        resolve();
      };
    });
  }

  private async pump(): Promise<void> {
    while (!this.disposed && !this.failed) {
      const generation = this.generation;
      const iterator = this.iterator;
      if (!iterator || this.ended || this.aheadFull()) {
        await this.waitForWake();
        continue;
      }
      let result: IteratorResult<FrameSample, void>;
      try {
        result = await iterator.next();
      } catch (error) {
        if (generation !== this.generation || this.disposed) continue;
        if (this.retryInSoftware(true)) continue;
        this.fail(error);
        return;
      }
      if (generation !== this.generation || this.disposed) {
        if (!result.done) result.value.close();
        continue;
      }
      if (result.done) {
        this.ended = true;
        this.settleWaiters();
        continue;
      }
      const entry = this.toQueued(result.value, generation);
      if (!entry) return;
      this.queue.push(entry);
      this.pruneBehindTarget();
      this.settleWaiters();
    }
  }

  private toQueued(sample: FrameSample, generation: number): QueuedFrame | null {
    try {
      const frame = sample.toVideoFrame();
      openFrames += 1;
      this.decodedAny = true;
      return { sec: sample.timestamp, durationSec: sample.duration, frame, generation };
    } catch (error) {
      this.fail(error);
      return null;
    } finally {
      sample.close();
    }
  }

  /**
   * The prefer-software retry for a decoder that failed before its first
   * frame (D2). `restartIterator` is false on the single-frame path, which
   * has no iterator.
   */
  private retryInSoftware(restartIterator: boolean): boolean {
    if (this.decodedAny || this.preferSoftware) return false;
    this.preferSoftware = true;
    try {
      this.sink = this.options.createSink(true);
    } catch {
      return false;
    }
    if (restartIterator) this.restart(this.targetSec);
    return true;
  }

  private fail(error: unknown): void {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.stopIterator();
    this.settleWaiters();
    this.options.onError(error, !this.decodedAny);
  }

  /** Decode the single frame at `sourceSec`, newest request first (D7). */
  private decodeOne(sourceSec: number): Promise<void> {
    if (this.iterator) {
      this.generation += 1;
      this.stopIterator();
      for (const entry of this.queue) closeFrame(entry);
      this.queue = [];
    }
    this.randomTargetSec = sourceSec;
    const idle = new Promise<void>((resolve) => this.randomIdle.push(resolve));
    if (!this.randomBusy) {
      this.randomBusy = true;
      void this.decodeRandom().finally(() => {
        this.randomBusy = false;
        for (const resolve of this.randomIdle.splice(0)) resolve();
      });
    }
    return idle;
  }

  private async decodeRandom(): Promise<void> {
    while (this.randomTargetSec !== null && !this.disposed && !this.failed) {
      const sec = this.randomTargetSec;
      this.randomTargetSec = null;
      const shown = this.shown;
      if (
        shown &&
        shown.durationSec > 0 &&
        frameStartsBy(shown.sec, sec) &&
        !frameStartsBy(shown.sec + shown.durationSec, sec)
      ) {
        continue;
      }
      let sample: FrameSample | null;
      try {
        // The export's selection rule: the slack lets a time computed one ulp
        // below a frame's timestamp select that frame.
        sample = await this.sink.getSample(Math.max(0, sec) + TIMESTAMP_EPSILON_SEC);
      } catch (error) {
        if (this.disposed || this.iterator) return;
        // A newer request supersedes the failed one. Only the newest
        // request's failure says the decoder is broken.
        if (this.randomTargetSec !== null) continue;
        if (this.retryInSoftware(false)) {
          this.randomTargetSec ??= sec;
          continue;
        }
        this.fail(error);
        return;
      }
      if (!sample) continue;
      if (this.disposed || this.iterator) {
        sample.close();
        return;
      }
      const entry = this.toQueued(sample, this.generation);
      if (!entry) return;
      if (this.shown) closeFrame(this.shown);
      this.shown = entry;
      this.restartSec = entry.sec;
    }
  }
}
