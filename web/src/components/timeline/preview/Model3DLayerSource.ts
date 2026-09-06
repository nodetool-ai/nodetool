/**
 * Model3DLayerSource — the browser's pixels for a `model3d` layer.
 *
 * A 3D clip draws through a **render session**: a glTF loaded once into three.js
 * on an `OffscreenCanvas`, then asked for frame after frame
 * (`createModel3DRenderSession`, design §D5). A session owns a WebGL context, so
 * this pool holds at most {@link MAX_MODEL3D_LAYERS} of them — the same number
 * the scene model lets be active at once — and evicts the least recently drawn.
 *
 * What fixes a session is `Model3DSessionOptions`: lighting, intensity,
 * background and the animation selection. A clip that changes any of them gets a
 * new session rather than a rebuilt mixer, because a mixer whose actions were
 * swapped mid-session is the same picture as a fresh one and harder to prove.
 * The camera is not one of them: it is per frame, so orbiting, keying a camera
 * channel or scrubbing never reloads the model.
 *
 * Both browser hosts drive this: the live preview polls {@link acquire} and
 * draws nothing until the session resolves, and the export awaits {@link load}
 * so a frame is never baked into the file without its model.
 */

import {
  resolveModel3DCamera,
  type ClipModel3DStyle,
  type Model3DCameraChannels
} from "@nodetool-ai/timeline";
import {
  MAX_MODEL3D_LAYERS,
  type ActiveLayer
} from "@nodetool-ai/timeline/render";
import type {
  Model3DRenderSession,
  Model3DSessionOptions
} from "@nodetool-ai/video-nodes/nodes/model3d/render3d-core";

export type { Model3DRenderSession, Model3DSessionOptions };

/** Why a 3D layer will not draw, short of it still loading. */
export type Model3DUnavailableReason =
  /** No WebGL or no `OffscreenCanvas` in this browser (R1). */
  | "no_webgl"
  /** The GLB could not be fetched, parsed, or turned into a session. */
  | "load_failed";

/** A 3D layer that will not draw, and what to say about it. */
export interface Model3DUnavailable {
  status: "unavailable";
  reason: Model3DUnavailableReason;
  /** One line for the preview placeholder and the inspector. */
  message: string;
}

/** What the pool knows about one clip's session right now. */
export type Model3DLayerState =
  | { status: "loading" }
  | { status: "ready"; session: Model3DRenderSession }
  | Model3DUnavailable;

/** The pixel size a frame is rendered at. */
export interface Model3DFrameSize {
  width: number;
  height: number;
}

/** The session factory, injectable so a test drives the pool without three.js. */
export type CreateModel3DRenderSession = (
  glb: Uint8Array,
  options: Model3DSessionOptions
) => Promise<Model3DRenderSession>;

export interface Model3DLayerSourceOptions {
  /**
   * A clip's asset id as a fetchable URL. Undefined means "not yet" — the pool
   * forgets the layer and retries on the next {@link Model3DLayerSource.acquire},
   * because both hosts resolve asset urls asynchronously and already draw a
   * placeholder while one is in flight.
   */
  resolveUrl: (
    assetId: string
  ) => string | undefined | Promise<string | undefined>;
  /** Fires when a session becomes ready or unavailable, so the host repaints. */
  onChange?: () => void;
  /** Live sessions, i.e. WebGL contexts. Default {@link MAX_MODEL3D_LAYERS}. */
  maxSessions?: number;
  /** GLBs kept parsed-and-ready, least recently used first out. Default 4. */
  maxCachedModels?: number;
  /** Whether this browser can render 3D at all. Default: a WebGL probe. */
  supported?: () => boolean;
  /** Overrides the lazily imported three.js session factory. */
  createSession?: CreateModel3DRenderSession;
  /** Overrides the GLB fetch. */
  fetchModel?: (url: string) => Promise<Uint8Array>;
}

interface PoolEntry {
  assetId: string;
  options: Model3DSessionOptions;
  state: Model3DLayerState;
  /** Monotonic stamp of the last acquire, for least-recently-used eviction. */
  usedAt: number;
  /** Resolves once {@link state} has left `loading`. */
  pending: Promise<void>;
}

/** The session options a clip's style fixes (design §D5). */
export function model3dSessionOptions(
  style: ClipModel3DStyle
): Model3DSessionOptions {
  return {
    lighting: style.lighting,
    lightIntensity: style.lightIntensity,
    background: style.background,
    animation: style.animation
  };
}

type SessionBackground = Model3DSessionOptions["background"];

function sameBackground(a: SessionBackground, b: SessionBackground): boolean {
  if (a.transparent) return b.transparent;
  return !b.transparent && a.color === b.color;
}

/** Whether two styles would drive the same session. */
export function sameModel3DSessionOptions(
  a: Model3DSessionOptions,
  b: Model3DSessionOptions
): boolean {
  return (
    a.lighting === b.lighting &&
    a.lightIntensity === b.lightIntensity &&
    sameBackground(a.background, b.background) &&
    a.animation.clipName === b.animation.clipName &&
    a.animation.loop === b.animation.loop &&
    a.animation.speed === b.animation.speed
  );
}

let renderSupport: boolean | undefined;

/**
 * Whether this browser can run a render session: `OffscreenCanvas` plus a WebGL
 * context. Probed once — the probe itself costs a context, and a browser does
 * not gain WebGL mid-session.
 */
export function hasModel3DRenderSupport(): boolean {
  if (renderSupport === undefined) {
    renderSupport = probeRenderSupport();
  }
  return renderSupport;
}

function probeRenderSupport(): boolean {
  if (typeof OffscreenCanvas === "undefined") return false;
  try {
    const probe = new OffscreenCanvas(1, 1);
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    // Hand the context back rather than holding one of the browser's dozen or
    // so for the life of the tab.
    const lose = (
      gl as { getExtension(name: string): { loseContext?(): void } | null }
    ).getExtension("WEBGL_lose_context");
    lose?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}

async function fetchGlb(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`the model could not be fetched (HTTP ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const importSession: CreateModel3DRenderSession = async (glb, options) => {
  // Loaded on demand: three.js and the meshopt decoder are the heaviest thing
  // the timeline can pull, and a document with no 3D clip never pays for them.
  const { createModel3DRenderSession } = await import(
    "@nodetool-ai/video-nodes/nodes/model3d/render3d-core"
  );
  return createModel3DRenderSession(glb, options);
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Model3DLayerSource {
  private readonly entries = new Map<string, PoolEntry>();
  /** GLB bytes by asset id, in least-recently-used order. */
  private readonly models = new Map<string, Uint8Array>();
  private readonly pendingModels = new Map<string, Promise<Uint8Array>>();
  private readonly maxSessions: number;
  private readonly maxCachedModels: number;
  private readonly supported: () => boolean;
  private readonly createSession: CreateModel3DRenderSession;
  private readonly fetchModel: (url: string) => Promise<Uint8Array>;
  private tick = 0;
  private disposed = false;

  constructor(private readonly options: Model3DLayerSourceOptions) {
    this.maxSessions = options.maxSessions ?? MAX_MODEL3D_LAYERS;
    this.maxCachedModels = options.maxCachedModels ?? 4;
    this.supported = options.supported ?? hasModel3DRenderSupport;
    this.createSession = options.createSession ?? importSession;
    this.fetchModel = options.fetchModel ?? fetchGlb;
  }

  /**
   * The clip's session if it is loaded, null while it loads or when it cannot.
   * Starts the load, and re-creates the session when the clip's asset or its
   * session options have changed since the pooled one was made.
   */
  acquire(layer: ActiveLayer): Model3DRenderSession | null {
    const entry = this.entryFor(layer);
    return entry?.state.status === "ready" ? entry.state.session : null;
  }

  /** The clip's session once it has settled — null when it cannot be made. */
  async load(layer: ActiveLayer): Promise<Model3DRenderSession | null> {
    const entry = this.entryFor(layer);
    if (!entry) return null;
    await entry.pending;
    return entry.state.status === "ready" ? entry.state.session : null;
  }

  /**
   * One drawn frame of a 3D layer, or null when its session is not ready. The
   * camera is the clip's own pose folded with the sampled channels, and the
   * time is the layer's `sourceTimeSec` — the clip's source clock, already
   * multiplied by `animation.speed` by the scene model.
   */
  frame(
    layer: ActiveLayer,
    anim: Model3DCameraChannels,
    size: Model3DFrameSize
  ): OffscreenCanvas | null {
    const style = layer.model3dStyle;
    if (!style) return null;
    const session = this.acquire(layer);
    if (!session) return null;
    return session.render({
      timeSec: layer.sourceTimeSec ?? 0,
      camera: resolveModel3DCamera(style, anim),
      width: size.width,
      height: size.height
    });
  }

  /** What the pool knows about a clip, or undefined when it holds nothing. */
  state(clipId: string): Model3DLayerState | undefined {
    return this.entries.get(clipId)?.state;
  }

  /** Drop every session but these clips' — what a host calls on a scene change. */
  retain(clipIds: Iterable<string>): void {
    const keep = new Set(clipIds);
    for (const clipId of [...this.entries.keys()]) {
      if (!keep.has(clipId)) this.release(clipId);
    }
  }

  /** Dispose one clip's session and forget it. */
  release(clipId: string): void {
    const entry = this.entries.get(clipId);
    if (!entry) return;
    this.entries.delete(clipId);
    if (entry.state.status === "ready") entry.state.session.dispose();
  }

  dispose(): void {
    this.disposed = true;
    for (const clipId of [...this.entries.keys()]) this.release(clipId);
    this.models.clear();
    this.pendingModels.clear();
  }

  /**
   * The pooled entry for this layer, creating one when the clip is new or when
   * its asset or session options no longer match what the pool holds.
   */
  private entryFor(layer: ActiveLayer): PoolEntry | undefined {
    const style = layer.model3dStyle;
    const assetId = layer.assetId;
    if (!style || !assetId || this.disposed) return undefined;

    const options = model3dSessionOptions(style);
    const existing = this.entries.get(layer.clipId);
    if (existing) {
      if (
        existing.assetId === assetId &&
        sameModel3DSessionOptions(existing.options, options)
      ) {
        existing.usedAt = ++this.tick;
        return existing;
      }
      this.release(layer.clipId);
    }

    this.evictFor(layer.clipId);
    const entry: PoolEntry = {
      assetId,
      options,
      state: { status: "loading" },
      usedAt: ++this.tick,
      pending: Promise.resolve()
    };
    this.entries.set(layer.clipId, entry);
    entry.pending = this.open(layer.clipId, entry);
    return entry;
  }

  /** Free a slot for `clipId`, disposing the least recently drawn session. */
  private evictFor(clipId: string): void {
    while (this.entries.size >= this.maxSessions) {
      let oldest: string | undefined;
      let oldestAt = Infinity;
      for (const [id, entry] of this.entries) {
        if (id !== clipId && entry.usedAt < oldestAt) {
          oldest = id;
          oldestAt = entry.usedAt;
        }
      }
      if (oldest === undefined) return;
      this.release(oldest);
    }
  }

  private async open(clipId: string, entry: PoolEntry): Promise<void> {
    if (!this.supported()) {
      this.settle(clipId, entry, {
        status: "unavailable",
        reason: "no_webgl",
        message: "This browser has no WebGL, so 3D clips cannot be drawn here."
      });
      return;
    }
    try {
      const url = await this.options.resolveUrl(entry.assetId);
      if (!url) {
        // The asset has not resolved (or is gone). Forget the entry so the next
        // acquire tries again; the host draws its own missing-asset placeholder.
        if (this.entries.get(clipId) === entry) this.entries.delete(clipId);
        return;
      }
      const glb = await this.model(entry.assetId, url);
      if (this.entries.get(clipId) !== entry) return;
      const session = await this.createSession(glb, entry.options);
      if (this.entries.get(clipId) !== entry) {
        // Superseded or released while the session was being built.
        session.dispose();
        return;
      }
      this.settle(clipId, entry, { status: "ready", session });
    } catch (error) {
      this.settle(clipId, entry, {
        status: "unavailable",
        reason: "load_failed",
        message: `This 3D clip could not be drawn: ${messageOf(error)}`
      });
    }
  }

  private settle(
    clipId: string,
    entry: PoolEntry,
    state: Model3DLayerState
  ): void {
    if (this.entries.get(clipId) !== entry) return;
    entry.state = state;
    this.options.onChange?.();
  }

  /** The GLB's bytes, fetched once per asset and cached least recently used. */
  private async model(assetId: string, url: string): Promise<Uint8Array> {
    const cached = this.models.get(assetId);
    if (cached) {
      this.models.delete(assetId);
      this.models.set(assetId, cached);
      return cached;
    }
    let pending = this.pendingModels.get(assetId);
    if (!pending) {
      pending = this.fetchModel(url);
      this.pendingModels.set(assetId, pending);
      const forget = (): void => {
        this.pendingModels.delete(assetId);
      };
      pending.then(forget, forget);
    }
    const bytes = await pending;
    this.models.set(assetId, bytes);
    while (this.models.size > this.maxCachedModels) {
      const oldest = this.models.keys().next().value;
      if (oldest === undefined || oldest === assetId) break;
      this.models.delete(oldest);
    }
    return bytes;
  }
}
