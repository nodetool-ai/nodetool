/**
 * Tests for the RunNodeState model.
 *
 * Covers: constructor defaults, beforeSave, getNodeState, getOrCreate,
 * getIncompleteNodes, getSuspendedNodes, state transitions, status checks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { RunNodeState } from "../src/run-node-state.js";

// ── Setup ────────────────────────────────────────────────────────────

describe("RunNodeState model", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── Constructor defaults ──────────────────────────────────────────

  it("sets default values", () => {
    const state = new RunNodeState({ run_id: "r1", node_id: "n1" });
    expect(state.status).toBe("idle");
    expect(state.attempt).toBe(1);
    expect(state.scheduled_at).toBeNull();
    expect(state.started_at).toBeNull();
    expect(state.completed_at).toBeNull();
    expect(state.failed_at).toBeNull();
    expect(state.suspended_at).toBeNull();
    expect(state.last_error).toBeNull();
    expect(state.retryable).toBe(false);
    expect(state.suspension_reason).toBeNull();
    expect(state.resume_state_json).toBeNull();
    expect(state.outputs_json).toBeNull();
  });

  it("coerces numeric boolean for retryable", () => {
    const state = new RunNodeState({
      run_id: "r1",
      node_id: "n1",
      retryable: 1
    });
    expect(state.retryable).toBe(true);

    const state2 = new RunNodeState({
      run_id: "r1",
      node_id: "n1",
      retryable: 0
    });
    expect(state2.retryable).toBe(false);
  });

  // ── beforeSave ────────────────────────────────────────────────────

  it("generates composite id on save", async () => {
    const state = await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1"
    });
    expect(state.id).toBe("r1::n1");
  });

  it("updates updated_at on save", async () => {
    const state = await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1"
    });
    const original = state.updated_at;
    await new Promise((r) => setTimeout(r, 5));

    state.status = "running";
    await state.save();
    expect(state.updated_at >= original).toBe(true);
  });

  // ── getNodeState ──────────────────────────────────────────────────

  it("retrieves state by run_id and node_id", async () => {
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1",
      status: "running"
    });

    const state = await RunNodeState.getNodeState("r1", "n1");
    expect(state).not.toBeNull();
    expect(state!.status).toBe("running");
  });

  it("returns null for nonexistent node state", async () => {
    const state = await RunNodeState.getNodeState("r1", "nonexistent");
    expect(state).toBeNull();
  });

  // ── getOrCreate ───────────────────────────────────────────────────

  it("creates idle state when none exists", async () => {
    const state = await RunNodeState.getOrCreate("r1", "n1");
    expect(state.status).toBe("idle");
    expect(state.run_id).toBe("r1");
    expect(state.node_id).toBe("n1");
    expect(state.attempt).toBe(1);
  });

  it("returns existing state without modification", async () => {
    const created = await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1",
      status: "completed"
    });

    const existing = await RunNodeState.getOrCreate("r1", "n1");
    expect(existing.status).toBe("completed");
    expect(existing.id).toBe(created.id);
  });

  // ── getIncompleteNodes ────────────────────────────────────────────

  it("returns scheduled and running nodes", async () => {
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1",
      status: "scheduled"
    });
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n2",
      status: "running"
    });
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n3",
      status: "completed"
    });

    const incomplete = await RunNodeState.getIncompleteNodes("r1");
    expect(incomplete).toHaveLength(2);
    const ids = incomplete.map((s) => s.node_id).sort();
    expect(ids).toEqual(["n1", "n2"]);
  });

  it("returns empty array when no incomplete nodes", async () => {
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1",
      status: "completed"
    });

    const incomplete = await RunNodeState.getIncompleteNodes("r1");
    expect(incomplete).toHaveLength(0);
  });

  // ── getSuspendedNodes ─────────────────────────────────────────────

  it("returns only suspended nodes", async () => {
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n1",
      status: "suspended"
    });
    await RunNodeState.create<RunNodeState>({
      run_id: "r1",
      node_id: "n2",
      status: "running"
    });

    const suspended = await RunNodeState.getSuspendedNodes("r1");
    expect(suspended).toHaveLength(1);
    expect(suspended[0].node_id).toBe("n1");
  });

  // ── State transitions ─────────────────────────────────────────────

  describe("markScheduled", () => {
    it("sets status to scheduled", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markScheduled();
      expect(state.status).toBe("scheduled");
      expect(state.scheduled_at).toBeTruthy();
    });

    it("accepts explicit attempt number", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markScheduled(3);
      expect(state.attempt).toBe(3);
    });

    it("auto-increments attempt when started_at is set", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      state.started_at = new Date().toISOString();
      await state.markScheduled();
      expect(state.attempt).toBe(2);
    });
  });

  describe("markRunning", () => {
    it("sets status to running and started_at", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markRunning();
      expect(state.status).toBe("running");
      expect(state.started_at).toBeTruthy();
    });
  });

  describe("markCompleted", () => {
    it("sets status to completed", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markCompleted();
      expect(state.status).toBe("completed");
      expect(state.completed_at).toBeTruthy();
    });

    it("stores outputs when provided", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markCompleted({ result: 42 });
      expect(state.outputs_json).toEqual({ result: 42 });
    });

    it("does not set outputs when not provided", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markCompleted();
      expect(state.outputs_json).toBeNull();
    });
  });

  describe("markFailed", () => {
    it("sets status to failed with error message", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markFailed("something broke");
      expect(state.status).toBe("failed");
      expect(state.failed_at).toBeTruthy();
      expect(state.last_error).toBe("something broke");
      expect(state.retryable).toBe(false);
    });

    it("marks as retryable when specified", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markFailed("timeout", true);
      expect(state.retryable).toBe(true);
    });
  });

  describe("markSuspended", () => {
    it("sets status to suspended with reason and state", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markSuspended("waiting for input", { step: 3 });
      expect(state.status).toBe("suspended");
      expect(state.suspended_at).toBeTruthy();
      expect(state.suspension_reason).toBe("waiting for input");
      expect(state.resume_state_json).toEqual({ step: 3 });
    });
  });

  describe("markResuming", () => {
    it("sets status to running with resume state", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markSuspended("paused", { step: 3 });
      await state.markResuming({ step: 4 });
      expect(state.status).toBe("running");
      expect(state.resume_state_json).toEqual({ step: 4 });
      expect(state.started_at).toBeTruthy();
    });
  });

  describe("markPaused", () => {
    it("sets status to paused", async () => {
      const state = await RunNodeState.getOrCreate("r1", "n1");
      await state.markPaused();
      expect(state.status).toBe("paused");
    });
  });

  // ── Status checks ─────────────────────────────────────────────────

  describe("status checks", () => {
    it("isIncomplete returns true for scheduled", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "scheduled"
      });
      expect(state.isIncomplete()).toBe(true);
    });

    it("isIncomplete returns true for running", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "running"
      });
      expect(state.isIncomplete()).toBe(true);
    });

    it("isIncomplete returns false for completed", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "completed"
      });
      expect(state.isIncomplete()).toBe(false);
    });

    it("isSuspended returns true for suspended", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "suspended"
      });
      expect(state.isSuspended()).toBe(true);
    });

    it("isSuspended returns false for running", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "running"
      });
      expect(state.isSuspended()).toBe(false);
    });

    it("isRetryableFailure returns true for retryable failed", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "failed",
        retryable: true
      });
      expect(state.isRetryableFailure()).toBe(true);
    });

    it("isRetryableFailure returns false for non-retryable failed", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "failed",
        retryable: false
      });
      expect(state.isRetryableFailure()).toBe(false);
    });

    it("isRetryableFailure returns false for completed", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "completed"
      });
      expect(state.isRetryableFailure()).toBe(false);
    });

    it("isPaused returns true for paused", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "paused"
      });
      expect(state.isPaused()).toBe(true);
    });

    it("isPaused returns false for running", () => {
      const state = new RunNodeState({
        run_id: "r1",
        node_id: "n1",
        status: "running"
      });
      expect(state.isPaused()).toBe(false);
    });
  });
});
