/**
 * Unit tests for the tRPC nodes router.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn()
  };
});

import { getSecret } from "@nodetool-ai/models";

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

describe("nodes router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("replicateStatus (public)", () => {
    it("returns configured: true when REPLICATE_API_TOKEN is set", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
        "test-token-123"
      );
      const caller = createCaller(makeCtx({ userId: null }));
      const result = await caller.nodes.replicateStatus();
      expect(result.configured).toBe(true);
    });

    it("returns configured: false when REPLICATE_API_TOKEN is not set", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx({ userId: null }));
      const result = await caller.nodes.replicateStatus();
      expect(result.configured).toBe(false);
    });
  });

  describe("validateUsername (protected)", () => {
    it("returns valid: true for a proper username", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john_doe"
      });
      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });

    it("returns valid: false for a username with spaces", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john doe"
      });
      expect(result.valid).toBe(false);
    });

    it("returns valid: true for a username with hyphens and underscores", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john-doe_123"
      });
      expect(result.valid).toBe(true);
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.nodes.validateUsername({ username: "test" })
      ).rejects.toThrow();
    });
  });

  describe("dummy (protected)", () => {
    it("returns the expected dummy asset shape", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.dummy();
      expect(result.type).toBe("asset");
      expect(result.uri).toBe("");
      expect(result.asset_id).toBeNull();
      expect(result.data).toBeNull();
      expect(result.metadata).toBeNull();
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.nodes.dummy()).rejects.toThrow();
    });
  });
});
