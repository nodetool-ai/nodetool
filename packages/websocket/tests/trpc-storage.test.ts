import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Adapter stub driving the prefixed → flat fallback. Only keys added to
// `existingKeys` are present.
const storageMocks = vi.hoisted(() => ({
  existingKeys: new Set<string>(),
  adapter: {
    uriForKey: (key: string) => `file:///assets/${key}`,
    exists: vi.fn(),
    delete: vi.fn(),
    stat: vi.fn(),
    store: vi.fn(),
    retrieve: vi.fn()
  }
}));
storageMocks.adapter.exists.mockImplementation(async (uri: string) =>
  storageMocks.existingKeys.has(uri.replace("file:///assets/", ""))
);

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => storageMocks.adapter
}));

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
      // "victim" belongs to user-2 only — user-1 never owns it.
      userId === "user-1" && id !== "victim"
        ? ({ id, user_id: userId } as never)
        : null
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
    storageMocks.existingKeys.clear();
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

    // The owner prefix passes `canReadStorageKey` on its own, but once the
    // prefixed object is missing and resolution falls back to the flat legacy
    // key, the prefix no longer says anything about ownership. Signing that
    // key handed user-1 a URL to user-2's bytes.
    it("does not fall back to a flat legacy key the caller does not own", async () => {
      storageMocks.existingKeys.add("victim.png");
      const caller = createCaller(makeCtx({ userId: "user-1" }));
      await expect(
        caller.storage.signUrl({ key: "user-1/victim.png" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("still falls back to a flat legacy key the caller does own", async () => {
      storageMocks.existingKeys.add("mine.png");
      const caller = createCaller(makeCtx({ userId: "user-1" }));
      const { url } = await caller.storage.signUrl({
        key: "user-1/mine.png"
      });
      expect(url).toContain("mine.png");
      expect(url).not.toContain("user-1/mine.png");
    });

    it("prefers the owner-prefixed object when it exists", async () => {
      storageMocks.existingKeys.add("user-1/mine.png");
      storageMocks.existingKeys.add("mine.png");
      const caller = createCaller(makeCtx({ userId: "user-1" }));
      const { url } = await caller.storage.signUrl({
        key: "user-1/mine.png"
      });
      expect(url).toContain("user-1/mine.png");
    });
  });
});
