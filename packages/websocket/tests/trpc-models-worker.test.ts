/**
 * Worker-scoped model routes on the tRPC models router.
 *
 * `scope: "worker"` on huggingfaceList / huggingfaceDelete routes to the
 * attached worker's Python bridge; `scope: "local"` (default) keeps the
 * existing local-FS behavior. No worker attached / old image → CONFLICT.
 */
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

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

const ATTACHED = { id: "w1", status: "attached" };

describe("models.huggingfaceList scope=worker", () => {
  it("routes to pythonBridge.listCachedModels when a worker is attached", async () => {
    const listCachedModels = vi
      .fn()
      .mockResolvedValue([
        { id: "org/m", name: "org/m", repo_id: "org/m", downloaded: true }
      ]);
    const ctx = makeCtx({
      pythonBridge: {
        listCachedModels,
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(ATTACHED)
      } as never
    });
    const caller = createCaller(ctx);
    const models = await caller.models.huggingfaceList({ scope: "worker" });
    expect(listCachedModels).toHaveBeenCalledOnce();
    expect(models[0].repo_id).toBe("org/m");
  });

  it("throws CONFLICT when no worker is attached", async () => {
    const ctx = makeCtx({
      pythonBridge: {
        listCachedModels: vi.fn(),
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(null)
      } as never
    });
    const caller = createCaller(ctx);
    await expect(
      caller.models.huggingfaceList({ scope: "worker" })
    ).rejects.toThrow(/No worker attached/i);
  });

  it("throws CONFLICT when the attached worker image is too old", async () => {
    const ctx = makeCtx({
      pythonBridge: {
        listCachedModels: vi.fn(),
        supportsModelManagement: () => false
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(ATTACHED)
      } as never
    });
    const caller = createCaller(ctx);
    await expect(
      caller.models.huggingfaceList({ scope: "worker" })
    ).rejects.toThrow(/too old/i);
  });

  it("scope=local (no input) does not touch the bridge", async () => {
    const listCachedModels = vi.fn();
    const ctx = makeCtx({
      pythonBridge: {
        listCachedModels,
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(ATTACHED)
      } as never
    });
    const caller = createCaller(ctx);
    await caller.models.huggingfaceList();
    expect(listCachedModels).not.toHaveBeenCalled();
  });
});

describe("models.huggingfaceDelete scope=worker", () => {
  it("deletes via the bridge when scope=worker", async () => {
    const deleteCachedModel = vi.fn().mockResolvedValue(true);
    const ctx = makeCtx({
      pythonBridge: {
        deleteCachedModel,
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(ATTACHED)
      } as never
    });
    const caller = createCaller(ctx);
    expect(
      await caller.models.huggingfaceDelete({ repo_id: "org/m", scope: "worker" })
    ).toBe(true);
    expect(deleteCachedModel).toHaveBeenCalledWith("org/m");
  });

  it("throws CONFLICT when no worker is attached", async () => {
    const deleteCachedModel = vi.fn();
    const ctx = makeCtx({
      pythonBridge: {
        deleteCachedModel,
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(null)
      } as never
    });
    const caller = createCaller(ctx);
    await expect(
      caller.models.huggingfaceDelete({ repo_id: "org/m", scope: "worker" })
    ).rejects.toThrow(/No worker attached/i);
    expect(deleteCachedModel).not.toHaveBeenCalled();
  });

  it("scope=local (default) does not touch the bridge", async () => {
    const deleteCachedModel = vi.fn();
    const ctx = makeCtx({
      pythonBridge: {
        deleteCachedModel,
        supportsModelManagement: () => true
      } as never,
      workerManager: {
        getActiveWorker: vi.fn().mockResolvedValue(ATTACHED)
      } as never
    });
    const caller = createCaller(ctx);
    // local delete path returns a boolean from the local FS helper; in tests
    // that resolves to true via the suite's default mock — the point is the
    // bridge is NOT used.
    await caller.models.huggingfaceDelete({ repo_id: "org/m" });
    expect(deleteCachedModel).not.toHaveBeenCalled();
  });
});
