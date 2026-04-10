/**
 * @jest-environment jsdom
 *
 * Display seam regression test matrix.
 *
 * Proves first-interaction visibility for every entry-point into the shared
 * display pipeline:
 *
 *   1. Fresh-open click-only brush tap
 *   2. First dragged brush stroke
 *   3. Move drag (transform preview)
 *   4. Transform drag (transform preview)
 *   5. Startup imageReference / hydrated layer
 *   6. WebGPU bootstrap → display switch
 *   7. Canvas2D fallback
 *
 * These tests exercise the DisplayFrameCoordinator in isolation — they do NOT
 * mount React hooks. Each scenario verifies that the coordinator's redraw
 * routing, readiness tracking, and tracing produce correct outcomes for the
 * relevant display seam path.
 */

import {
  DisplayFrameCoordinator,
  createInitialReadiness,
  isInteractionReady,
  type RedrawRequest,
  type TraceEvent
} from "../sketchCanvasHooks/DisplayFrameCoordinator";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCoordinator(tracingEnabled = true): {
  coordinator: DisplayFrameCoordinator;
  drainSpy: jest.Mock;
  compositeSpy: jest.Mock;
} {
  const coordinator = new DisplayFrameCoordinator(tracingEnabled);
  const drainSpy = jest.fn();
  const compositeSpy = jest.fn();
  coordinator.setCallbacks({
    drainPendingStroke: drainSpy,
    compositeImmediate: compositeSpy
  });
  return { coordinator, drainSpy, compositeSpy };
}

function makeReadyCoordinator(): ReturnType<typeof makeCoordinator> {
  const result = makeCoordinator();
  result.coordinator.markRuntimeReady();
  result.coordinator.markHydrationComplete();
  result.coordinator.setDisplayTarget("display");
  return result;
}

// ─── Interaction readiness ───────────────────────────────────────────────────

describe("InteractionReadiness", () => {
  it("starts with nothing ready", () => {
    const state = createInitialReadiness();
    expect(state.runtimeReady).toBe(false);
    expect(state.hydrationComplete).toBe(false);
    expect(state.firstFrameComposited).toBe(false);
    expect(isInteractionReady(state)).toBe(false);
  });

  it("is ready only when all flags are true", () => {
    expect(
      isInteractionReady({
        runtimeReady: true,
        hydrationComplete: true,
        firstFrameComposited: true
      })
    ).toBe(true);
    expect(
      isInteractionReady({
        runtimeReady: true,
        hydrationComplete: false,
        firstFrameComposited: true
      })
    ).toBe(false);
  });
});

// ─── DisplayFrameCoordinator — core ──────────────────────────────────────────

describe("DisplayFrameCoordinator", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Readiness tracking ─────────────────────────────────────────────

  describe("readiness tracking", () => {
    it("tracks runtime, hydration, and first-frame readiness independently", () => {
      const { coordinator } = makeCoordinator();

      expect(coordinator.isReady()).toBe(false);

      coordinator.markRuntimeReady();
      expect(coordinator.getReadiness().runtimeReady).toBe(true);
      expect(coordinator.isReady()).toBe(false);

      coordinator.markHydrationComplete();
      expect(coordinator.getReadiness().hydrationComplete).toBe(true);
      expect(coordinator.isReady()).toBe(false);

      coordinator.markFirstFrameComposited();
      expect(coordinator.isReady()).toBe(true);
    });

    it("idempotent — duplicate marks are no-ops", () => {
      const { coordinator } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markRuntimeReady();
      const events = coordinator.tracer
        .getLog()
        .filter((e: TraceEvent) => e.type === "runtime-ready");
      expect(events.length).toBe(1);
    });

    it("resetReadiness clears all flags", () => {
      const { coordinator } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      coordinator.markFirstFrameComposited();
      expect(coordinator.isReady()).toBe(true);

      coordinator.resetReadiness();
      expect(coordinator.isReady()).toBe(false);
    });
  });

  // ── Typed frame requests ───────────────────────────────────────────

  describe("typed frame requests", () => {
    it("immediate request drains stroke and composites synchronously", () => {
      const { coordinator, drainSpy, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("paint-move", "immediate");

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledWith(null);
    });

    it("immediate request with dirty rect passes it through", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();
      const rect = { x: 10, y: 20, w: 30, h: 40 };

      coordinator.requestFrame("paint-move", "immediate", rect);

      expect(compositeSpy).toHaveBeenCalledWith(rect);
    });

    it("raf request schedules one rAF callback", () => {
      const { coordinator, drainSpy, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("transform-preview", "raf");

      // Not yet called — waiting for rAF.
      expect(drainSpy).not.toHaveBeenCalled();
      expect(compositeSpy).not.toHaveBeenCalled();
      expect(coordinator._getPendingRafId()).not.toBeNull();

      // Fire rAF.
      jest.advanceTimersByTime(16);

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("multiple raf requests in same frame coalesce into one composite", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("transform-preview", "raf");
      coordinator.requestFrame("layer-visibility", "raf");
      coordinator.requestFrame("viewport-change", "raf");

      jest.advanceTimersByTime(16);

      // Only one composite, not three.
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("immediate request cancels pending raf", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("transform-preview", "raf");
      expect(coordinator._getPendingRafId()).not.toBeNull();

      coordinator.requestFrame("paint-move", "immediate");
      expect(coordinator._getPendingRafId()).toBeNull();

      // Only the immediate call composited.
      expect(compositeSpy).toHaveBeenCalledTimes(1);

      // rAF fires but coordinator already handled it.
      jest.advanceTimersByTime(16);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("returns a typed RedrawRequest with reason, urgency, and timestamp", () => {
      const { coordinator } = makeReadyCoordinator();
      const before = performance.now();

      const request: RedrawRequest = coordinator.requestFrame(
        "buffered-stroke-commit",
        "raf"
      );

      expect(request.reason).toBe("buffered-stroke-commit");
      expect(request.urgency).toBe("raf");
      expect(request.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  // ── Dirty rect merging ─────────────────────────────────────────────

  describe("dirty rect merging", () => {
    it("merges multiple dirty rects into bounding box", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("paint-move", "raf", {
        x: 10,
        y: 10,
        w: 20,
        h: 20
      });
      coordinator.requestFrame("paint-move", "raf", {
        x: 50,
        y: 50,
        w: 10,
        h: 10
      });

      jest.advanceTimersByTime(16);

      // Merged rect: {x:10, y:10, w:50, h:50}
      expect(compositeSpy).toHaveBeenCalledWith({
        x: 10,
        y: 10,
        w: 50,
        h: 50
      });
    });

    it("full redraw overrides dirty rects", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      coordinator.requestFrame("paint-move", "raf", {
        x: 10,
        y: 10,
        w: 20,
        h: 20
      });
      coordinator.requestFrame("transform-preview", "raf"); // full redraw (no dirty)

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledWith(null); // full
    });

    it("live buffered stroke forces full redraw even with dirty rect", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();
      coordinator.setHasLiveBufferedStroke(true);

      coordinator.requestFrame("paint-move", "raf", {
        x: 10,
        y: 10,
        w: 20,
        h: 20
      });

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledWith(null); // forced full
    });
  });

  // ── Pending stroke drain ordering ──────────────────────────────────

  describe("pending stroke drain ordering", () => {
    it("drains pending stroke BEFORE composite in raf path", () => {
      const callOrder: string[] = [];
      const coordinator = new DisplayFrameCoordinator(false);
      coordinator.setCallbacks({
        drainPendingStroke: () => callOrder.push("drain"),
        compositeImmediate: () => callOrder.push("composite")
      });
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      coordinator.setDisplayTarget("display");

      coordinator.requestFrame("buffered-stroke-commit", "raf");
      jest.advanceTimersByTime(16);

      expect(callOrder).toEqual(["drain", "composite"]);
    });

    it("drains pending stroke BEFORE composite in immediate path", () => {
      const callOrder: string[] = [];
      const coordinator = new DisplayFrameCoordinator(false);
      coordinator.setCallbacks({
        drainPendingStroke: () => callOrder.push("drain"),
        compositeImmediate: () => callOrder.push("composite")
      });
      coordinator.markRuntimeReady();

      coordinator.requestFrame("paint-move", "immediate");

      expect(callOrder).toEqual(["drain", "composite"]);
    });
  });

  // ── Display target ─────────────────────────────────────────────────

  describe("display target management", () => {
    it("starts in bootstrap target", () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getDisplayTarget()).toBe("bootstrap");
    });

    it("switches to display target", () => {
      const { coordinator } = makeCoordinator();
      coordinator.setDisplayTarget("display");
      expect(coordinator.getDisplayTarget()).toBe("display");
    });

    it("no-op when setting same target", () => {
      const { coordinator } = makeCoordinator();
      coordinator.setDisplayTarget("bootstrap");
      const events = coordinator.tracer
        .getLog()
        .filter((e: TraceEvent) => e.type === "target-changed");
      expect(events.length).toBe(0);
    });

    it("tracks backend changes", () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getBackend()).toBe("canvas2d");
      coordinator.setBackend("webgpu");
      expect(coordinator.getBackend()).toBe("webgpu");
    });
  });

  // ── First frame composited ─────────────────────────────────────────

  describe("first frame composited", () => {
    it("marks first frame composited on first immediate request", () => {
      const { coordinator } = makeReadyCoordinator();
      expect(coordinator.getReadiness().firstFrameComposited).toBe(false);

      coordinator.requestFrame("initial-composite", "immediate");

      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });

    it("marks first frame composited on first raf request", () => {
      const { coordinator } = makeReadyCoordinator();

      coordinator.requestFrame("hydration-complete", "raf");
      expect(coordinator.getReadiness().firstFrameComposited).toBe(false);

      jest.advanceTimersByTime(16);
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });
  });

  // ── Cleanup ────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("cancelPending cancels rAF", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();
      coordinator.requestFrame("external", "raf");
      expect(coordinator._getPendingRafId()).not.toBeNull();

      coordinator.cancelPending();
      expect(coordinator._getPendingRafId()).toBeNull();

      jest.advanceTimersByTime(16);
      expect(compositeSpy).not.toHaveBeenCalled();
    });

    it("dispose clears callbacks, pending, and trace", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();
      coordinator.requestFrame("external", "raf");
      coordinator.tracer.trace("frame-requested");

      coordinator.dispose();

      jest.advanceTimersByTime(16);
      expect(compositeSpy).not.toHaveBeenCalled();
      expect(coordinator.tracer.getLog().length).toBe(0);
    });
  });

  // ── No callbacks wired ─────────────────────────────────────────────

  describe("no callbacks wired", () => {
    it("does not throw when requesting frame without callbacks", () => {
      const coordinator = new DisplayFrameCoordinator(false);
      expect(() => {
        coordinator.requestFrame("external", "immediate");
      }).not.toThrow();
    });

    it("does not throw for raf without callbacks", () => {
      const coordinator = new DisplayFrameCoordinator(false);
      coordinator.requestFrame("external", "raf");
      expect(() => {
        jest.advanceTimersByTime(16);
      }).not.toThrow();
    });
  });
});

// ─── Scenario regression matrix ──────────────────────────────────────────────

describe("Display seam scenario regression matrix", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Scenario 1: fresh-open click-only brush tap", () => {
    it("immediate composite fires on first tap even without prior stroke", () => {
      const { coordinator, drainSpy, compositeSpy } = makeReadyCoordinator();

      // Simulate: user taps (pointerdown + pointerup, no drag).
      // This should produce a visible frame immediately.
      coordinator.requestFrame("paint-move", "immediate");

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });

    it("works even during bootstrap phase (Canvas2D temp target)", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      // Still in bootstrap — display target is "bootstrap".

      coordinator.requestFrame("paint-move", "immediate");

      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Scenario 2: first dragged brush stroke", () => {
    it("batched raf composites fire correctly during drag", () => {
      const { coordinator, compositeSpy, drainSpy } = makeReadyCoordinator();

      // Simulate: multiple pointer-move events during drag.
      coordinator.requestFrame("paint-move", "raf", {
        x: 0,
        y: 0,
        w: 10,
        h: 10
      });
      coordinator.requestFrame("paint-move", "raf", {
        x: 5,
        y: 5,
        w: 10,
        h: 10
      });

      jest.advanceTimersByTime(16);

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      // Dirty rects merged.
      expect(compositeSpy).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        w: 15,
        h: 15
      });
    });

    it("stroke commit drain happens before composite on pointer-up", () => {
      const callOrder: string[] = [];
      const coordinator = new DisplayFrameCoordinator(false);
      coordinator.setCallbacks({
        drainPendingStroke: () => callOrder.push("drain"),
        compositeImmediate: () => callOrder.push("composite")
      });
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // Pointer-up: deferred commit, then raf.
      coordinator.requestFrame("buffered-stroke-commit", "raf");
      jest.advanceTimersByTime(16);

      expect(callOrder).toEqual(["drain", "composite"]);
    });
  });

  describe("Scenario 3: move drag (transform preview)", () => {
    it("transform preview redraw fires correctly", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      // Simulate: move tool sets preview, triggers redraw.
      coordinator.requestFrame("transform-preview", "raf");

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledWith(null); // full redraw for preview
    });

    it("first transform preview on fresh editor produces visible frame", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();
      expect(coordinator.getReadiness().firstFrameComposited).toBe(false);

      coordinator.requestFrame("transform-preview", "raf");
      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalled();
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });
  });

  describe("Scenario 4: transform drag (scale/rotate)", () => {
    it("multiple transform preview updates coalesce into one composite", () => {
      const { coordinator, compositeSpy } = makeReadyCoordinator();

      // Simulate: rapid scale handle drag.
      coordinator.requestFrame("transform-preview", "raf");
      coordinator.requestFrame("transform-preview", "raf");
      coordinator.requestFrame("transform-preview", "raf");

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Scenario 5: startup imageReference / hydrated layer", () => {
    it("hydration-complete triggers a visible frame", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();

      // Simulate: hydration finishes, layer data loaded.
      coordinator.markHydrationComplete();
      coordinator.requestFrame("hydration-complete", "raf");

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getReadiness().hydrationComplete).toBe(true);
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });

    it("readiness tracks hydration independently from runtime", () => {
      const { coordinator } = makeCoordinator();

      coordinator.markHydrationComplete();
      expect(coordinator.getReadiness().hydrationComplete).toBe(true);
      expect(coordinator.getReadiness().runtimeReady).toBe(false);
      expect(coordinator.isReady()).toBe(false);
    });
  });

  describe("Scenario 6: WebGPU bootstrap → display switch", () => {
    it("bootstrap → display switch does not drop frame", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // Start in bootstrap.
      expect(coordinator.getDisplayTarget()).toBe("bootstrap");

      // Composite during bootstrap.
      coordinator.requestFrame("initial-composite", "immediate");
      expect(compositeSpy).toHaveBeenCalledTimes(1);

      // Switch to real display (WebGPU ready).
      coordinator.setDisplayTarget("display");
      coordinator.setBackend("webgpu");
      coordinator.requestFrame("bootstrap-switch", "immediate");

      expect(compositeSpy).toHaveBeenCalledTimes(2);
      expect(coordinator.getDisplayTarget()).toBe("display");
      expect(coordinator.getBackend()).toBe("webgpu");
    });

    it("records bootstrap-switch trace event", () => {
      const { coordinator } = makeCoordinator();
      coordinator.setBackend("webgpu");

      const events = coordinator.tracer
        .getLog()
        .filter((e: TraceEvent) => e.type === "bootstrap-switch");
      expect(events.length).toBe(1);
      expect(events[0].detail).toEqual({ backend: "webgpu" });
    });
  });

  describe("Scenario 7: Canvas2D fallback", () => {
    it("works correctly with canvas2d backend from start", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      coordinator.setDisplayTarget("display");

      // Canvas2D is the default backend.
      expect(coordinator.getBackend()).toBe("canvas2d");

      coordinator.requestFrame("initial-composite", "immediate");
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.isReady()).toBe(true);
    });

    it("device-recovery produces visible frame after fallback", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      coordinator.setDisplayTarget("display");
      coordinator.setBackend("webgpu");

      // WebGPU device lost → fallback to Canvas2D.
      coordinator.setBackend("canvas2d");
      coordinator.requestFrame("device-recovery", "immediate");

      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getBackend()).toBe("canvas2d");
    });
  });
});

// ─── Dev-only tracing ────────────────────────────────────────────────────────

describe("DisplayTracer", () => {
  it("records events with timestamps", () => {
    const { coordinator } = makeCoordinator(true);

    coordinator.tracer.trace("preview-set", { layerId: "layer-1" });
    coordinator.tracer.trace("frame-requested", { reason: "transform-preview" });

    const log = coordinator.tracer.getLog();
    expect(log.length).toBeGreaterThanOrEqual(2);

    const previewSet = log.find((e: TraceEvent) => e.type === "preview-set");
    expect(previewSet).toBeDefined();
    expect(previewSet!.detail).toEqual({ layerId: "layer-1" });
  });

  it("caps at MAX_TRACE_EVENTS", () => {
    const { coordinator } = makeCoordinator(true);

    for (let i = 0; i < 300; i++) {
      coordinator.tracer.trace("frame-requested");
    }

    // Should be capped at 200.
    expect(coordinator.tracer.getLog().length).toBeLessThanOrEqual(200);
  });

  it("clear empties the log", () => {
    const { coordinator } = makeCoordinator(true);
    coordinator.tracer.trace("preview-set");
    coordinator.tracer.clear();
    expect(coordinator.tracer.getLog().length).toBe(0);
  });

  it("disabled tracer does not record", () => {
    const { coordinator } = makeCoordinator(false);
    coordinator.tracer.trace("preview-set");
    expect(coordinator.tracer.getLog().length).toBe(0);
  });
});

// ─── Startup first-interaction regression tests ──────────────────────────────
//
// These tests prove that first-interaction rendering is deterministic on a
// freshly opened editor. They cover the gap between:
//
// 1. `markHydrationComplete()` — must be called from the production hydration
//    path so readiness tracking is accurate.
// 2. Initial composite from `useLayoutEffect` — must mark `firstFrameComposited`
//    via the coordinator so the readiness contract is not left in a half-ready
//    state after the very first visible paint.
// 3. Click-only brush tap — uses deferred `requestRedraw()` (rAF) for both
//    begin() and end(). The pendingCommit must not be lost when the first rAF
//    fires before readiness is established.
// 4. First transform preview — uses `requestFrame("transform-preview", "raf")`.
//    The first preview frame must not be dropped because bootstrap/display
//    targets or pending rAF state is not ready.
// 5. Interaction during hydration — frames requested before hydration completes
//    must still produce composites (not be silently dropped).

describe("Startup first-interaction regression", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("click-only brush tap lifecycle", () => {
    it("deferred requestRedraw from begin() produces a composite even before firstFrameComposited", () => {
      // Simulate: fresh editor, runtime ready, hydration done, but no composite yet.
      const { coordinator, drainSpy, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      // firstFrameComposited is false — no prior composite has run.
      expect(coordinator.getReadiness().firstFrameComposited).toBe(false);

      // begin() calls ctx.requestRedraw() which routes to requestFrame("external", "raf").
      coordinator.requestFrame("paint-move", "raf");

      // rAF fires.
      jest.advanceTimersByTime(16);

      // Composite must fire even though firstFrameComposited was false.
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(drainSpy).toHaveBeenCalledTimes(1);
      // And now firstFrameComposited should be true.
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });

    it("deferred pendingCommit from end() is drained on the same rAF as begin()'s composite", () => {
      // Simulate: click-only tap where begin() and end() both schedule rAF
      // in the same frame (before any rAF callback runs).
      const callOrder: string[] = [];
      const coordinator = new DisplayFrameCoordinator(false);
      coordinator.setCallbacks({
        drainPendingStroke: () => callOrder.push("drain"),
        compositeImmediate: () => callOrder.push("composite")
      });
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // begin() schedules rAF
      coordinator.requestFrame("paint-move", "raf");
      // end() schedules rAF (coalesces with begin's rAF)
      coordinator.requestFrame("buffered-stroke-commit", "raf");

      // Only one rAF should fire, draining + compositing.
      jest.advanceTimersByTime(16);

      expect(callOrder).toEqual(["drain", "composite"]);
    });

    it("first click-only tap after startup composite still drains and composites", () => {
      // Simulate: startup composite has already run (firstFrameComposited = true),
      // then user taps.
      const { coordinator, drainSpy, compositeSpy } = makeReadyCoordinator();
      // Run the initial composite to establish firstFrameComposited.
      coordinator.requestFrame("initial-composite", "immediate");
      expect(coordinator.isReady()).toBe(true);

      drainSpy.mockClear();
      compositeSpy.mockClear();

      // Click-only tap: begin's requestRedraw + end's requestRedraw.
      coordinator.requestFrame("paint-move", "raf");
      coordinator.requestFrame("buffered-stroke-commit", "raf");

      jest.advanceTimersByTime(16);

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("first transform preview visibility", () => {
    it("first preview frame is not dropped when rAF fires before firstFrameComposited", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      expect(coordinator.getReadiness().firstFrameComposited).toBe(false);

      // Move tool sets preview → requestFrame("transform-preview", "raf").
      coordinator.requestFrame("transform-preview", "raf");

      jest.advanceTimersByTime(16);

      // Preview composite must not be dropped.
      expect(compositeSpy).toHaveBeenCalledTimes(1);
      // Full redraw (no dirty rect) for preview.
      expect(compositeSpy).toHaveBeenCalledWith(null);
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
    });

    it("immediate transform preview works during bootstrap phase", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      // Still in bootstrap target.
      expect(coordinator.getDisplayTarget()).toBe("bootstrap");

      coordinator.requestFrame("transform-preview", "immediate");

      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("preview after bootstrap→display switch is not dropped", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // Initial composite in bootstrap.
      coordinator.requestFrame("initial-composite", "immediate");
      expect(compositeSpy).toHaveBeenCalledTimes(1);

      // Switch to display (WebGPU ready).
      coordinator.setDisplayTarget("display");
      coordinator.setBackend("webgpu");
      coordinator.requestFrame("bootstrap-switch", "immediate");
      expect(compositeSpy).toHaveBeenCalledTimes(2);

      // First preview after switch.
      coordinator.requestFrame("transform-preview", "raf");
      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("interaction during hydration / pre-readiness", () => {
    it("frame requests before hydration complete still produce composites", () => {
      // Runtime ready but hydration not complete.
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      // No markHydrationComplete() — simulates user tapping before hydration finishes.

      coordinator.requestFrame("paint-move", "immediate");

      // Coordinator does NOT gate frames on readiness — composites always fire.
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("frame requests before runtime ready still produce composites", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      // Nothing marked ready.

      coordinator.requestFrame("paint-move", "immediate");

      // Composites fire regardless of readiness.
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("rAF frame before any readiness flags fires correctly", () => {
      const { coordinator, drainSpy, compositeSpy } = makeCoordinator();

      coordinator.requestFrame("external", "raf");
      jest.advanceTimersByTime(16);

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("hydration-complete marking contract", () => {
    it("coordinator exposes markHydrationComplete for production hydration path", () => {
      const { coordinator } = makeCoordinator();
      expect(coordinator.getReadiness().hydrationComplete).toBe(false);

      coordinator.markHydrationComplete();

      expect(coordinator.getReadiness().hydrationComplete).toBe(true);
      const traceEvents = coordinator.tracer.getLog()
        .filter((e: TraceEvent) => e.type === "hydration-complete");
      expect(traceEvents.length).toBe(1);
    });

    it("interaction-ready trace fires only when all three flags are set", () => {
      const { coordinator } = makeCoordinator();

      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      // Still not ready — firstFrameComposited is false.
      let readyEvents = coordinator.tracer.getLog()
        .filter((e: TraceEvent) => e.type === "interaction-ready");
      expect(readyEvents.length).toBe(0);

      // Trigger a composite to mark firstFrameComposited.
      coordinator.requestFrame("initial-composite", "immediate");

      readyEvents = coordinator.tracer.getLog()
        .filter((e: TraceEvent) => e.type === "interaction-ready");
      expect(readyEvents.length).toBe(1);
      expect(coordinator.isReady()).toBe(true);
    });
  });

  describe("initial composite → coordinator handoff", () => {
    it("notifyInitialComposite marks firstFrameComposited without scheduling a new frame", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // Simulate the useLayoutEffect initial composite going through coordinator.
      coordinator.notifyInitialComposite();

      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
      // No new composite should be scheduled — the caller already composited.
      expect(compositeSpy).not.toHaveBeenCalled();
      expect(coordinator.isReady()).toBe(true);
    });

    it("notifyInitialComposite is idempotent", () => {
      const { coordinator } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      coordinator.notifyInitialComposite();
      coordinator.notifyInitialComposite();

      const frameEvents = coordinator.tracer.getLog()
        .filter((e: TraceEvent) => e.type === "frame-composited" && e.detail?.initial === true);
      expect(frameEvents.length).toBe(1);
    });
  });

  describe("WebGPU startup first-interaction", () => {
    it("first brush tap during WebGPU bootstrap produces visible composite", () => {
      const { coordinator, drainSpy, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      // Still in bootstrap (WebGPU initializing).
      expect(coordinator.getDisplayTarget()).toBe("bootstrap");

      // User taps brush.
      coordinator.requestFrame("paint-move", "raf");
      coordinator.requestFrame("buffered-stroke-commit", "raf");

      jest.advanceTimersByTime(16);

      expect(drainSpy).toHaveBeenCalledTimes(1);
      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });

    it("first move preview during WebGPU bootstrap produces visible composite", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();
      expect(coordinator.getDisplayTarget()).toBe("bootstrap");

      coordinator.requestFrame("transform-preview", "raf");
      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("imageReference / hydrated layer startup", () => {
    it("hydration callback requestRedraw produces composite even as first frame", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      // Hydration completes, triggers requestRedraw.
      coordinator.markHydrationComplete();
      coordinator.requestFrame("hydration-complete", "raf");

      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.getReadiness().firstFrameComposited).toBe(true);
      expect(coordinator.isReady()).toBe(true);
    });

    it("preview on hydrated layer after image decode works as first interaction", () => {
      const { coordinator, compositeSpy } = makeCoordinator();
      coordinator.markRuntimeReady();
      coordinator.markHydrationComplete();

      // Image decode callback fires, triggers requestRedraw.
      coordinator.requestFrame("hydration-complete", "raf");
      jest.advanceTimersByTime(16);
      expect(coordinator.isReady()).toBe(true);

      compositeSpy.mockClear();

      // First transform preview on the hydrated layer.
      coordinator.requestFrame("transform-preview", "raf");
      jest.advanceTimersByTime(16);

      expect(compositeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
