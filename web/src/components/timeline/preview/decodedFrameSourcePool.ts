/**
 * The open WebCodecs decoders of the timeline preview (design D6).
 *
 * The compositor names every clip/asset pair that should hold a decoder: the
 * active ones at distance 0 and the upcoming ones at their distance from the
 * playhead. The pool opens what is missing, keeps at most {@link
 * MAX_OPEN_DECODERS}, and closes the pair furthest from the playhead first.
 * An asset that WebCodecs cannot decode is remembered, and its clips use the
 * `<video>` path (D2).
 */
import {
  openDecodableVideoTrack,
  type OpenVideoTrackResult
} from "../render/clipDecoder";
import {
  DecodedFrameSource,
  openDecodedFrameCount,
  type DecodedFrameSourceOptions
} from "./DecodedFrameSource";
import { emitTimelinePreviewDiagnostic } from "./gpu/previewDiagnostics";

/** Matches the 8 hot and 4 cold elements of the `<video>` pool. */
export const MAX_OPEN_DECODERS = 12;

export interface DecodedSourceRequest {
  /** `videoSlotKey(clipId, assetUrl)`. */
  key: string;
  url: string;
  /** Milliseconds until the clip starts; 0 for an active clip. */
  distanceMs: number;
}

export type DecodedSourceState =
  | { status: "opening" }
  | { status: "ready"; source: DecodedFrameSource }
  | { status: "fallback"; reason: string };

type SourceCallbacks = Pick<DecodedFrameSourceOptions, "id" | "onError">;

/** Opens one decoded source, or reports why the asset stays on `<video>`. */
export type OpenDecodedSource = (
  url: string,
  callbacks: SourceCallbacks,
  signal: AbortSignal
) => Promise<DecodedFrameSource | { reason: string }>;

export interface DecodedFrameSourcePoolOptions {
  /** A source opened, fell back, or closed. The compositor re-renders. */
  onChange: () => void;
  /** A decode failed after the clip drew its first frame. */
  onFailure: (key: string, error: unknown) => void;
  open?: OpenDecodedSource;
  maxOpen?: number;
}

interface PoolEntry {
  url: string;
  controller: AbortController;
  state: DecodedSourceState;
}

/** The production opener: mediabunny on the asset URL. */
export const openDecodedSource: OpenDecodedSource = async (url, callbacks, signal) => {
  const result: OpenVideoTrackResult = await openDecodableVideoTrack(url, signal);
  if (!result.ok) return { reason: result.reason };
  const { input, width, height, createSink } = result.opened;
  return new DecodedFrameSource({
    ...callbacks,
    width,
    height,
    createSink,
    onDispose: () => input.dispose()
  });
};

export class DecodedFrameSourcePool {
  private readonly entries = new Map<string, PoolEntry>();
  /** Assets WebCodecs cannot decode, with the reason. Kept for the pool's life. */
  private readonly fallbacks = new Map<string, string>();
  private readonly options: DecodedFrameSourcePoolOptions;
  private readonly open: OpenDecodedSource;
  private readonly maxOpen: number;
  private disposed = false;

  constructor(options: DecodedFrameSourcePoolOptions) {
    this.options = options;
    this.open = options.open ?? openDecodedSource;
    this.maxOpen = options.maxOpen ?? MAX_OPEN_DECODERS;
  }

  /**
   * The state of one pair. Undefined means the pool does not hold it, which
   * the compositor treats as still opening.
   */
  state(key: string, url: string): DecodedSourceState | undefined {
    const reason = this.fallbacks.get(url);
    if (reason !== undefined) return { status: "fallback", reason };
    return this.entries.get(key)?.state;
  }

  /** Whether WebCodecs already failed for this asset. */
  isFallback(url: string): boolean {
    return this.fallbacks.has(url);
  }

  /** Hold decoders for these pairs and close every other one. */
  retain(requests: readonly DecodedSourceRequest[]): void {
    if (this.disposed) return;
    const wanted = [...requests]
      .filter((request) => !this.fallbacks.has(request.url))
      .sort((a, b) => a.distanceMs - b.distanceMs);
    const kept = new Map<string, DecodedSourceRequest>();
    for (const request of wanted) {
      if (kept.size >= this.maxOpen) break;
      if (!kept.has(request.key)) kept.set(request.key, request);
    }
    let closed = false;
    for (const [key, entry] of this.entries) {
      if (kept.get(key)?.url === entry.url) continue;
      this.close(key, entry);
      closed = true;
    }
    for (const request of kept.values()) {
      if (!this.entries.has(request.key)) this.start(request);
    }
    if (closed) this.reportOpenFrames();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [key, entry] of this.entries) this.close(key, entry);
    this.reportOpenFrames();
  }

  private start(request: DecodedSourceRequest): void {
    const controller = new AbortController();
    const entry: PoolEntry = {
      url: request.url,
      controller,
      state: { status: "opening" }
    };
    this.entries.set(request.key, entry);
    const callbacks: SourceCallbacks = {
      id: request.key,
      onError: (error, beforeFirstFrame) => {
        if (this.entries.get(request.key) !== entry) return;
        if (beforeFirstFrame) {
          this.fallBack(request.key, entry, "decode-error");
          return;
        }
        this.options.onFailure(request.key, error);
      }
    };
    this.open(request.url, callbacks, controller.signal)
      .then((result) => {
        if (this.entries.get(request.key) !== entry || controller.signal.aborted) {
          if (result instanceof DecodedFrameSource) result.dispose();
          return;
        }
        if (!(result instanceof DecodedFrameSource)) {
          this.fallBack(request.key, entry, result.reason);
          return;
        }
        entry.state = { status: "ready", source: result };
        emitTimelinePreviewDiagnostic({
          kind: "decoder-open",
          sourceId: request.key,
          implementation: "webcodecs"
        });
        this.options.onChange();
      })
      .catch((error: unknown) => {
        if (this.entries.get(request.key) !== entry || controller.signal.aborted) return;
        this.fallBack(request.key, entry, error instanceof Error ? error.message : "open-error");
      });
  }

  /** Move an asset to the `<video>` path before any of its clips drew a frame. */
  private fallBack(key: string, entry: PoolEntry, reason: string): void {
    this.fallbacks.set(entry.url, reason);
    this.close(key, entry);
    emitTimelinePreviewDiagnostic({
      kind: "decoder-open",
      sourceId: key,
      implementation: "element",
      reason
    });
    // Every other clip on the same asset falls back with it.
    for (const [otherKey, other] of this.entries) {
      if (other.url === entry.url) this.close(otherKey, other);
    }
    this.options.onChange();
  }

  private close(key: string, entry: PoolEntry): void {
    entry.controller.abort();
    if (entry.state.status === "ready") entry.state.source.dispose();
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }

  private reportOpenFrames(): void {
    emitTimelinePreviewDiagnostic({ kind: "frames-open", count: openDecodedFrameCount() });
  }
}
