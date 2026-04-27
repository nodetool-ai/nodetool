/**
 * DisplayFrameCoordinator
 *
 * Single shared seam that owns the contract for "a visual change becomes
 * visible." Centralizes:
 *
 * 1. **Typed redraw requests** — every redraw records a reason and urgency
 *    (`immediate` vs `raf`) so temporal bugs can be debugged from one place.
 *
 * 2. **Interaction readiness** — explicit state tracking for when the display
 *    pipeline is ready for first interactive frame. Preview-only and click-only
 *    paths must not rely on implicit timing between hydration, runtime
 *    bootstrap, and redraw scheduling.
 *
 * 3. **Pending buffered-stroke drain** — deferred stroke commits are drained
 *    before any frame that claims to show committed pixels.
 *
 * 4. **Active display target** — `bootstrap` (Canvas2D temp) vs real display
 *    (WebGPU or Canvas2D final). Target switching must not drop the first
 *    interactive frame.
 *
 * 5. **Dev-only tracing** — lightweight event log for temporal startup bugs.
 *
 * ## Display invariants (MUST hold)
 *
 * - **Preview transforms are visual-only.** They create a temporary document
 *   snapshot during compositing; the original document is never mutated.
 *   Previews must never be persisted or written to undo.
 *
 * - **Pending stroke commit must be drained before frames that claim to show
 *   committed pixels.** The drain happens at the start of each rAF callback
 *   before `compositeToDisplay` runs.
 *
 * - **Bootstrap/display switching must not drop the first interactive frame.**
 *   When the runtime switches from bootstrap (Canvas2D temp) to real display
 *   (WebGPU or Canvas2D final), all layer GPU textures are invalidated and a
 *   redraw is requested. The first composite after the switch must produce a
 *   visible frame.
 *
 * - **First-open tap/preview must work without a prior stroke.** The display
 *   pipeline must be ready for preview-only and click-only interactions on a
 *   freshly opened editor — no "warm-up drag" should be required.
 *
 * ## Transient visual change contract
 *
 * Both transform preview and buffered-brush preview use the same central
 * visibility semantics via this coordinator:
 *
 * 1. The source of change calls `requestFrame(reason, urgency)`.
 * 2. The coordinator routes to immediate composite or schedules an rAF.
 * 3. Before compositing, pending stroke commits are drained.
 * 4. The active display target is resolved (bootstrap vs real).
 * 5. The composite runs with the latest document state + previews.
 * 6. Dev tracing records the event for debugging.
 *
 * Goal: one understandable answer to "what changed, and why should it be
 * visible now?"
 */

// ─── Redraw request types ────────────────────────────────────────────────────

/**
 * Reason for requesting a frame redraw.
 * Used for debugging and tracing — every redraw has a declared cause.
 */
export type RedrawReason =
  | "transform-preview"
  | "buffered-stroke-commit"
  | "paint-move"
  | "hydration-complete"
  | "bootstrap-switch"
  | "zoom-change"
  | "layer-visibility"
  | "layer-added"
  | "layer-removed"
  | "layer-effect"
  | "selection-change"
  | "viewport-change"
  | "initial-composite"
  | "device-recovery"
  | "external";

/**
 * Urgency of the redraw request.
 * - `immediate`: composite synchronously (low-latency path for direct drawing)
 * - `raf`: schedule via requestAnimationFrame (batched, coalesced)
 */
export type RedrawUrgency = "immediate" | "raf";

/**
 * A typed redraw request that records why and how urgently a frame is needed.
 */
export interface RedrawRequest {
  reason: RedrawReason;
  urgency: RedrawUrgency;
  /** Optional dirty rect for partial compositing. */
  dirtyRect?: { x: number; y: number; w: number; h: number } | null;
  /** Timestamp when the request was created. */
  timestamp: number;
}

// ─── Display target ──────────────────────────────────────────────────────────

/**
 * Which display target is currently active.
 * - `bootstrap`: Canvas2D temp surface while WebGPU initializes
 * - `display`: real display canvas (WebGPU or Canvas2D final)
 */
export type DisplayTarget = "bootstrap" | "display";

/**
 * Which rendering backend is active.
 */
export type DisplayBackend = "webgpu" | "canvas2d";

// ─── Interaction readiness ───────────────────────────────────────────────────

/**
 * Readiness conditions that must all be met before the first interactive frame.
 *
 * When all flags are true, the display pipeline is ready for preview-only
 * and click-only interactions without requiring a prior stroke.
 */
export interface InteractionReadiness {
  /** The runtime (Canvas2D or WebGPU) has been initialized. */
  runtimeReady: boolean;
  /** Layer canvases have been hydrated from document data. */
  hydrationComplete: boolean;
  /** The first composite has been dispatched to the display target. */
  firstFrameComposited: boolean;
}

/**
 * Returns true when all readiness conditions are met.
 */
export function isInteractionReady(state: InteractionReadiness): boolean {
  return (
    state.runtimeReady &&
    state.hydrationComplete &&
    state.firstFrameComposited
  );
}

/**
 * Create a fresh readiness state (nothing ready yet).
 */
export function createInitialReadiness(): InteractionReadiness {
  return {
    runtimeReady: false,
    hydrationComplete: false,
    firstFrameComposited: false
  };
}

// ─── Dev-only tracing ────────────────────────────────────────────────────────

/**
 * Trace event types for the display seam.
 */
export type TraceEventType =
  | "preview-set"
  | "preview-cleared"
  | "frame-requested"
  | "pending-stroke-drained"
  | "frame-composited"
  | "hydration-complete"
  | "runtime-ready"
  | "bootstrap-switch"
  | "interaction-ready"
  | "target-changed"
  | "readiness-updated";

export interface TraceEvent {
  type: TraceEventType;
  timestamp: number;
  detail?: Record<string, unknown>;
}

const DEV = process.env.NODE_ENV === "development";
const MAX_TRACE_EVENTS = 200;

/**
 * Lightweight dev-only tracing ring buffer for the display seam.
 *
 * Stores the last N events so temporal startup bugs can be debugged
 * without scattering temporary logs across tools and runtimes.
 */
export class DisplayTracer {
  private events: TraceEvent[] = [];
  private enabled: boolean;

  constructor(enabled = DEV) {
    this.enabled = enabled;
  }

  trace(type: TraceEventType, detail?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    const event: TraceEvent = {
      type,
      timestamp: performance.now(),
      detail
    };
    this.events.push(event);
    if (this.events.length > MAX_TRACE_EVENTS) {
      this.events.shift();
    }
  }

  /**
   * Return a copy of the trace log (most recent last).
   * Useful for dev-tools inspection.
   */
  getLog(): ReadonlyArray<TraceEvent> {
    return [...this.events];
  }

  /**
   * Clear all recorded events.
   */
  clear(): void {
    this.events.length = 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// ─── Frame coordinator ───────────────────────────────────────────────────────

export interface FrameCoordinatorCallbacks {
  /** Execute pending stroke buffer merge. */
  drainPendingStroke: () => void;
  /** Run the composite pipeline immediately. */
  compositeImmediate: (
    dirtyRect?: { x: number; y: number; w: number; h: number } | null
  ) => boolean | void;
}

/**
 * DisplayFrameCoordinator
 *
 * Stateful coordinator that manages typed redraw requests, interaction
 * readiness, and dev tracing. This is a plain class (not a React hook) so it
 * can be tested in isolation and shared via ref between hooks.
 *
 * ## Usage
 *
 * 1. Create an instance and hold it in a React ref.
 * 2. Wire callbacks (`drainPendingStroke`, `compositeImmediate`) after
 *    compositing hooks mount.
 * 3. Call `requestFrame(reason, urgency)` instead of ad hoc `redraw()` /
 *    `requestRedraw()` / `requestDirtyRedraw()`.
 * 4. The coordinator routes to the correct path and records tracing.
 */
export class DisplayFrameCoordinator {
  // ── State ──────────────────────────────────────────────────────────
  private readiness: InteractionReadiness;
  private displayTarget: DisplayTarget = "bootstrap";
  private backend: DisplayBackend = "canvas2d";
  private rafId: number | null = null;
  private pendingFullRedraw = false;
  private pendingDirty: { x: number; y: number; w: number; h: number } | null = null;
  private hasLiveBufferedStroke = false;

  // ── Callbacks (wired after mount) ──────────────────────────────────
  private callbacks: FrameCoordinatorCallbacks | null = null;

  // ── Tracing ────────────────────────────────────────────────────────
  readonly tracer: DisplayTracer;

  constructor(tracingEnabled = DEV) {
    this.readiness = createInitialReadiness();
    this.tracer = new DisplayTracer(tracingEnabled);
  }

  // ─── Callback wiring ─────────────────────────────────────────────
  setCallbacks(cb: FrameCoordinatorCallbacks): void {
    this.callbacks = cb;
  }

  // ─── Readiness ────────────────────────────────────────────────────
  getReadiness(): Readonly<InteractionReadiness> {
    return { ...this.readiness };
  }

  isReady(): boolean {
    return isInteractionReady(this.readiness);
  }

  markRuntimeReady(): void {
    if (this.readiness.runtimeReady) {
      return;
    }
    this.readiness.runtimeReady = true;
    this.tracer.trace("runtime-ready", { backend: this.backend });
    this.checkInteractionReady();
  }

  markHydrationComplete(): void {
    if (this.readiness.hydrationComplete) {
      return;
    }
    this.readiness.hydrationComplete = true;
    this.tracer.trace("hydration-complete");
    this.checkInteractionReady();
  }

  markFirstFrameComposited(): void {
    if (this.readiness.firstFrameComposited) {
      return;
    }
    this.readiness.firstFrameComposited = true;
    this.tracer.trace("frame-composited", { first: true });
    this.checkInteractionReady();
  }

  private checkInteractionReady(): void {
    if (isInteractionReady(this.readiness)) {
      this.tracer.trace("interaction-ready", {
        backend: this.backend,
        target: this.displayTarget
      });
    }
  }

  /**
   * Reset readiness (e.g., when the document changes entirely).
   */
  resetReadiness(): void {
    this.readiness = createInitialReadiness();
    this.tracer.trace("readiness-updated", { reset: true });
  }

  // ─── Display target / backend ─────────────────────────────────────
  getDisplayTarget(): DisplayTarget {
    return this.displayTarget;
  }

  getBackend(): DisplayBackend {
    return this.backend;
  }

  setDisplayTarget(target: DisplayTarget): void {
    if (this.displayTarget === target) {
      return;
    }
    const prev = this.displayTarget;
    this.displayTarget = target;
    this.tracer.trace("target-changed", { from: prev, to: target });
  }

  setBackend(backend: DisplayBackend): void {
    this.backend = backend;
    this.tracer.trace("bootstrap-switch", { backend });
  }

  // ─── Stroke tracking ─────────────────────────────────────────────
  setHasLiveBufferedStroke(active: boolean): void {
    this.hasLiveBufferedStroke = active;
  }

  // ─── Frame requests ───────────────────────────────────────────────

  /**
   * Request a frame with a declared reason and urgency.
   *
   * This is the single typed redraw request surface. All visual changes
   * should flow through here instead of calling `redraw()` /
   * `requestRedraw()` directly.
   */
  requestFrame(
    reason: RedrawReason,
    urgency: RedrawUrgency,
    dirtyRect?: { x: number; y: number; w: number; h: number } | null
  ): RedrawRequest {
    const request: RedrawRequest = {
      reason,
      urgency,
      dirtyRect: dirtyRect ?? null,
      timestamp: performance.now()
    };

    this.tracer.trace("frame-requested", {
      reason,
      urgency,
      hasDirty: dirtyRect != null,
      ready: isInteractionReady(this.readiness)
    });

    if (urgency === "immediate") {
      this.executeImmediate(request);
    } else {
      this.scheduleRaf(request);
    }

    return request;
  }

  private executeImmediate(request: RedrawRequest): void {
    if (!this.callbacks) {
      return;
    }
    // Cancel any pending rAF — immediate wins.
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingFullRedraw = false;
    this.pendingDirty = null;

    this.callbacks.drainPendingStroke();
    const didComposite = this.callbacks.compositeImmediate(request.dirtyRect);
    if (didComposite !== false) {
      this.onFrameComposited();
    }
  }

  private scheduleRaf(request: RedrawRequest): void {
    if (!request.dirtyRect) {
      this.pendingFullRedraw = true;
      this.pendingDirty = null;
    } else if (!this.pendingFullRedraw) {
      this.mergeDirty(request.dirtyRect);
    }

    if (this.rafId !== null) {
      // Already scheduled — the pending state was updated above.
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const isFull = this.pendingFullRedraw;
      const dirty = this.pendingDirty;
      this.pendingFullRedraw = false;
      this.pendingDirty = null;

      if (!this.callbacks) {
        return;
      }

      this.callbacks.drainPendingStroke();
      this.tracer.trace("pending-stroke-drained");

      const useFull = isFull || !dirty || this.hasLiveBufferedStroke;
      const didComposite = this.callbacks.compositeImmediate(
        useFull ? null : dirty
      );
      if (didComposite !== false) {
        this.onFrameComposited();
      }
    });
  }

  private mergeDirty(rect: { x: number; y: number; w: number; h: number }): void {
    const prev = this.pendingDirty;
    if (!prev) {
      this.pendingDirty = { ...rect };
      return;
    }
    const minX = Math.min(prev.x, rect.x);
    const minY = Math.min(prev.y, rect.y);
    const maxX = Math.max(prev.x + prev.w, rect.x + rect.w);
    const maxY = Math.max(prev.y + prev.h, rect.y + rect.h);
    this.pendingDirty = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private onFrameComposited(): void {
    if (!this.readiness.firstFrameComposited) {
      this.markFirstFrameComposited();
    }
  }

  // ─── Initial composite handoff ──────────────────────────────────────

  /**
   * Notify the coordinator that the initial composite was performed
   * externally (e.g. by the `useLayoutEffect` in `useCompositing`).
   *
   * This marks `firstFrameComposited` without scheduling a new frame,
   * since the caller has already run the composite synchronously.
   * Without this, the coordinator's readiness contract would be stuck
   * in a half-ready state after the very first visible paint.
   */
  notifyInitialComposite(): void {
    if (this.readiness.firstFrameComposited) {
      return;
    }
    this.readiness.firstFrameComposited = true;
    this.tracer.trace("frame-composited", { initial: true });
    this.checkInteractionReady();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────
  cancelPending(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingFullRedraw = false;
    this.pendingDirty = null;
  }

  dispose(): void {
    this.cancelPending();
    this.callbacks = null;
    this.tracer.clear();
  }

  // ─── Testing helpers ──────────────────────────────────────────────
  /** @internal — for tests only */
  _getPendingRafId(): number | null {
    return this.rafId;
  }

  /** @internal — for tests only */
  _isPendingFullRedraw(): boolean {
    return this.pendingFullRedraw;
  }
}
