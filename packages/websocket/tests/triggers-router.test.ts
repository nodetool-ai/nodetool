import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models and dispatcher functions
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    TriggerRegistration: {
      ...actual.TriggerRegistration,
      get: vi.fn()
    }
  };
});

vi.mock("../src/triggers/dispatcher.js", () => ({
  getTriggerWakeupService: vi.fn(),
  dispatchInput: vi.fn()
}));

import { TriggerRegistration } from "@nodetool-ai/models";
import {
  getTriggerWakeupService,
  dispatchInput
} from "../src/triggers/dispatcher.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

/**
 * Build a TriggerRegistration stub with the fields the router reads.
 */
function makeTriggerRegistration(opts: {
  id?: string;
  user_id?: string;
  workflow_id?: string;
  node_id?: string;
  kind?: string;
  enabled?: number;
}) {
  return {
    id: opts.id ?? "reg-1",
    user_id: opts.user_id ?? "user-1",
    workflow_id: opts.workflow_id ?? "wf-1",
    node_id: opts.node_id ?? "node-1",
    kind: opts.kind ?? "manual",
    enabled: opts.enabled ?? 1,
    config_json: null,
    last_fired_at: null,
    last_error: null,
    cursor: null,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z"
  };
}

describe("triggers router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fire", () => {
    it("returns job_id matching dispatchInput result when registration is owned by caller", async () => {
      const reg = makeTriggerRegistration({
        id: "reg-1",
        user_id: "user-1",
        workflow_id: "wf-1",
        node_id: "node-1"
      });
      (TriggerRegistration.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        reg
      );

      const mockWakeupService = {
        deliverTriggerInput: vi.fn().mockResolvedValue(true)
      };
      (getTriggerWakeupService as ReturnType<typeof vi.fn>).mockReturnValue(
        mockWakeupService
      );

      (dispatchInput as ReturnType<typeof vi.fn>).mockResolvedValue({
        jobId: "job-123"
      });

      const caller = createCaller(makeCtx());
      const result = await caller.triggers.fire({
        registrationId: "reg-1",
        payload: { test: "data" }
      });

      expect(result).toEqual({ job_id: "job-123" });
      expect(mockWakeupService.deliverTriggerInput).toHaveBeenCalledWith({
        runId: "wf-1",
        nodeId: "node-1",
        inputId: expect.any(String),
        payload: { test: "data" }
      });
      expect(dispatchInput).toHaveBeenCalledWith(expect.any(String));
    });

    it("throws NOT_FOUND when registration is owned by another user", async () => {
      const reg = makeTriggerRegistration({
        id: "reg-1",
        user_id: "other-user"
      });
      (TriggerRegistration.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        reg
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.triggers.fire({
          registrationId: "reg-1",
          payload: {}
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("throws NOT_FOUND when registrationId does not exist", async () => {
      (TriggerRegistration.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.triggers.fire({
          registrationId: "missing",
          payload: {}
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("refuses a disabled registration without storing an input", async () => {
      // Delivering first and rejecting afterwards left the input durably
      // stored but unprocessed — a pass only scans enabled registrations — so
      // it fired as a surprise the moment someone re-armed the trigger.
      const reg = makeTriggerRegistration({ id: "reg-1", enabled: 0 });
      (TriggerRegistration.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        reg
      );
      const mockWakeupService = {
        deliverTriggerInput: vi.fn().mockResolvedValue(true)
      };
      (getTriggerWakeupService as ReturnType<typeof vi.fn>).mockReturnValue(
        mockWakeupService
      );

      const caller = createCaller(makeCtx());

      await expect(
        caller.triggers.fire({ registrationId: "reg-1", payload: {} })
      ).rejects.toThrow(/not active/);

      expect(mockWakeupService.deliverTriggerInput).not.toHaveBeenCalled();
      expect(dispatchInput).not.toHaveBeenCalled();
    });

    it("uses idempotencyKey when provided to avoid duplicate runs", async () => {
      const reg = makeTriggerRegistration({
        id: "reg-1",
        user_id: "user-1"
      });
      (TriggerRegistration.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        reg
      );

      const mockWakeupService = {
        deliverTriggerInput: vi.fn().mockResolvedValue(true)
      };
      (getTriggerWakeupService as ReturnType<typeof vi.fn>).mockReturnValue(
        mockWakeupService
      );

      (dispatchInput as ReturnType<typeof vi.fn>).mockResolvedValue({
        jobId: "job-123"
      });

      const caller = createCaller(makeCtx());

      // First call with idempotency key
      const result1 = await caller.triggers.fire({
        registrationId: "reg-1",
        payload: {},
        idempotencyKey: "idempotent-key-1"
      });
      expect(result1.job_id).toBe("job-123");

      // Get the inputId from the first call
      const firstCall = (
        mockWakeupService.deliverTriggerInput as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      const firstInputId = firstCall[0].inputId;

      // Second call with same idempotency key should reuse the same inputId
      (dispatchInput as ReturnType<typeof vi.fn>).mockClear();
      (getTriggerWakeupService as ReturnType<typeof vi.fn>).mockReturnValue(
        mockWakeupService
      );
      (
        mockWakeupService.deliverTriggerInput as ReturnType<typeof vi.fn>
      ).mockClear();

      await caller.triggers.fire({
        registrationId: "reg-1",
        payload: {},
        idempotencyKey: "idempotent-key-1"
      });

      // Should use the same inputId due to idempotency key
      const secondCall = (
        mockWakeupService.deliverTriggerInput as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      const secondInputId = secondCall[0].inputId;

      expect(firstInputId).toBe(secondInputId);
    });
  });
});
