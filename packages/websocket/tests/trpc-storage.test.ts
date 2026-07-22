import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock Asset.find so the storage router's ownership check treats the test keys
// as owned by "user-1" (the storage dir is a shared bucket; ownership is
// verified by parsing the asset id from the key). foreign-user lookups return
// null so cross-user access is denied.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class MockAsset extends actual.Asset {
    static find = vi.fn(async (userId: string, id: string) =>
      userId === "user-1" ? ({ id, user_id: userId } as never) : null
    );
  }
  return { ...actual, Asset: MockAsset };
});

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

describe("storage router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── cross-user isolation (IDOR regression) ────────────────────────────────
  describe("user scoping", () => {
    it("does not return signed URLs for unowned keys", async () => {
      const caller = createCaller(makeCtx({ userId: "user-2" }));
      await expect(
        caller.storage.signUrl({ key: "victim-asset.png" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
