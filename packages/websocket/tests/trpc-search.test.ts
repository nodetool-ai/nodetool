import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, closeDb, initTestDb } from "@nodetool-ai/models";
import {
  reconcileLibraryIndex,
  runIndexerPass,
  setAssetBytesReader,
  stopLibraryIndexWrites
} from "@nodetool-ai/search-services";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";
const createCaller = createCallerFactory(appRouter);
const makeCtx = (userId = USER_ID): Context =>
  ({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

const files = new Map<string, string>();

async function seed(): Promise<Asset> {
  files.set("harbour.txt", "The lighthouse keeper logged every ship that passed the harbour.");
  const asset = await Asset.create({ user_id: USER_ID, name: "harbour.txt", content_type: "text/plain" });
  stopLibraryIndexWrites();
  await reconcileLibraryIndex();
  await runIndexerPass();
  return asset;
}

describe("search router", () => {
  beforeEach(() => {
    initTestDb();
    setAssetBytesReader(async (asset) => new TextEncoder().encode(files.get(asset.name) ?? ""));
  });

  afterEach(async () => {
    stopLibraryIndexWrites();
    setAssetBytesReader(null);
    files.clear();
    delete process.env.NODETOOL_NODE_PROFILE;
    ModelObserver.clear();
    await closeDb();
  });

  it("finds an asset by a word in its text and reads the matched passage", async () => {
    const asset = await seed();
    const caller = createCaller(makeCtx());
    const result = await caller.search.query({ query: "lighthouse" });
    expect(result.index.mode).toBe("keyword");
    expect(result.hits.map((hit) => hit.resource_id)).toEqual([asset.id]);
    const [match] = result.hits[0]!.matches;
    expect(match!.snippet).toContain("lighthouse");

    const read = await caller.search.read({ id: asset.id, locator: match!.locator });
    expect(read.item.resource_id).toBe(asset.id);
    expect(read.passages[read.matched]!.text).toContain("lighthouse");
  });

  it("never returns another owner's items", async () => {
    await seed();
    const result = await createCaller(makeCtx("someone-else")).search.query({ query: "lighthouse" });
    expect(result.hits).toEqual([]);
    await expect(createCaller(makeCtx("someone-else")).search.status()).resolves.toMatchObject({
      items: { total: 0 }
    });
  });

  it("reports status with the setup choice and the local model, and queues a rebuild", async () => {
    await seed();
    const caller = createCaller(makeCtx());
    const status = await caller.search.status();
    expect(status.items).toMatchObject({ ready: 1, total: 1 });
    expect(status.semantic.choice).toBe("unset");
    expect(status.can_set_up).toBe(true);
    expect(status.local_model.download_megabytes).toBeGreaterThan(0);
    await expect(caller.search.rebuild({ scope: "all" })).resolves.toEqual({ items: 1 });
    expect((await caller.search.status()).items.pending).toBe(1);
  });

  it("records the setup choice, and the cloud profile refuses it", async () => {
    const caller = createCaller(makeCtx());
    await expect(caller.search.setup({ model: null })).resolves.toEqual({ space: null });
    expect((await caller.search.status()).semantic.choice).toBe("off");
    await expect(
      caller.search.setup({ model: { provider: "openai", model: "text-embedding-3-small" } })
    ).resolves.toEqual({ space: "openai:text-embedding-3-small" });
    expect((await caller.search.status()).semantic).toMatchObject({
      choice: "on",
      space: "openai:text-embedding-3-small"
    });

    process.env.NODETOOL_NODE_PROFILE = "cloud";
    await expect(caller.search.setup({ model: null })).rejects.toThrow(/operator/);
    expect((await caller.search.status()).can_set_up).toBe(false);
  });

  it("answers similar_to with a note while search by meaning is off, and not found for an unknown item", async () => {
    const asset = await seed();
    const caller = createCaller(makeCtx());
    const result = await caller.search.query({ query: "", similar_to: asset.id });
    expect(result.hits).toEqual([]);
    expect(result.index.note).toMatch(/search by meaning/);
    await expect(caller.search.query({ query: "", similar_to: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("answers not found for an unknown item", async () => {
    await expect(createCaller(makeCtx()).search.read({ id: "missing" })).rejects.toThrow(/No library item/);
  });
});
