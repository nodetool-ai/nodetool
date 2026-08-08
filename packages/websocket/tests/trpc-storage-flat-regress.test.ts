import { describe, it, expect, beforeEach, vi } from "vitest";

const ASSET_FILE = "775ac6fedf9e4c9db271148c6e853b4d.png";
const PREFIXED_KEY = `user-1/${ASSET_FILE}`;

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

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class MockAsset extends actual.Asset {
    static find = vi.fn(async (userId: string, id: string) => {
      // user-1 owns the regression asset, regardless of extension
      const owned = id === "775ac6fedf9e4c9db271148c6e853b4d";
      return userId === "user-1" && owned ? ({ id, user_id: userId } as never) : null;
    });
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

describe("storage signUrl flat asset reference regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.existingKeys.clear();
    storageMocks.adapter.exists.mockImplementation(async (uri: string) =>
      storageMocks.existingKeys.has(uri.replace("file:///assets/", ""))
    );
  });

  it("translates flat asset reference to owner-prefixed key when prefixed object exists", async () => {
    storageMocks.existingKeys.add(PREFIXED_KEY);
    storageMocks.existingKeys.add(ASSET_FILE);
    const caller = createCaller(makeCtx({ userId: "user-1" }));
    const { url } = await caller.storage.signUrl({ key: ASSET_FILE });
    expect(url).toContain(PREFIXED_KEY);
    expect(url).not.toBe(`/api/storage/${ASSET_FILE}`);
  });

  it("prefers prefixed object and does not fall back to flat when both exist", async () => {
    storageMocks.existingKeys.add(PREFIXED_KEY);
    const caller = createCaller(makeCtx({ userId: "user-1" }));
    const { url } = await caller.storage.signUrl({ key: ASSET_FILE });
    expect(url).toContain(PREFIXED_KEY);
  });

  it("falls back to flat key when only flat object exists", async () => {
    storageMocks.existingKeys.add(ASSET_FILE);
    const caller = createCaller(makeCtx({ userId: "user-1" }));
    const { url } = await caller.storage.signUrl({ key: ASSET_FILE });
    expect(url).toContain(ASSET_FILE);
    // Should be flat, not prefixed
    expect(url).not.toContain(PREFIXED_KEY);
  });

  it("still enforces ownership for flat reference", async () => {
    storageMocks.existingKeys.add(ASSET_FILE);
    const caller = createCaller(makeCtx({ userId: "user-2" }));
    await expect(caller.storage.signUrl({ key: ASSET_FILE })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });
});
