import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext, setDefaultModelInterfaces } from "../src/context.js";
import { loadMediaRefBytes } from "../src/media-ref-bytes.js";

const ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BYTES = new Uint8Array([1, 2, 3]);

async function setup() {
  const storage = new InMemoryStorageAdapter();
  await storage.store(`owner/${ID}.wav`, BYTES);
  await storage.store(`other/${ID}.wav`, new Uint8Array([9]));
  const getAssetInfo = vi.fn(
    async ({ userId, assetId }: { userId: string; assetId: string }) =>
      userId === "owner" && assetId === ID
        ? {
            id: ID,
            name: "tone.wav",
            content_type: "audio/wav",
            metadata: null
          }
        : null
  );
  const context = new ProcessingContext({
    jobId: "owned-path",
    userId: "owner",
    storage,
    fetchFn: async () => new Response(null, { status: 404 }),
    modelInterfaces: { getAssetInfo }
  });
  return { context, storage, getAssetInfo };
}

describe("owned media references with storage paths", () => {
  afterEach(() => setDefaultModelInterfaces(null));

  it.each([ID, ID.slice(0, 12)])(
    "reads an uploaded image through the host default lookup for %s",
    async (assetId) => {
      const storage = new InMemoryStorageAdapter();
      await storage.store(`owner/${ID}.png`, BYTES, "image/png");
      const getAssetInfo = vi.fn(async ({ userId, assetId: requestedId }: { userId: string; assetId: string }) =>
        userId === "owner" && [ID, ID.slice(0, 12)].includes(requestedId)
          ? { id: ID, name: "product.png", content_type: "image/png" }
          : null
      );
      setDefaultModelInterfaces({ getAssetInfo });
      const context = new ProcessingContext({
        jobId: "app-upload-read",
        userId: "owner",
        storage,
        fetchFn: async () => new Response(null, { status: 404 })
      });
      expect(context.hasModelInterface("getAssetInfo")).toBe(true);
      expect(await loadMediaRefBytes({ asset_id: assetId }, context)).toEqual(BYTES);
      expect(getAssetInfo).toHaveBeenCalledWith({ userId: "owner", assetId });

      const other = new ProcessingContext({
        jobId: "other-upload-read", userId: "other", storage
      });
      const retrieve = vi.spyOn(storage, "retrieve");
      expect(await loadMediaRefBytes({ asset_id: assetId }, other)).toBeNull();
      expect(retrieve).not.toHaveBeenCalled();
    }
  );
  it.each([`asset://${ID}.wav`, `asset://owner/${ID}.wav`])(
    "resolves %s to the owned asset",
    async (uri) => {
      const { context, getAssetInfo } = await setup();
      expect(await loadMediaRefBytes({ type: "audio", uri }, context)).toEqual(
        BYTES
      );
      expect(getAssetInfo).toHaveBeenCalledWith({
        userId: "owner",
        assetId: ID
      });
    }
  );

  it("reads a bare owned asset id when the owner listing leaves it out", async () => {
    // Supabase lists at most 1000 children of the owner folder, so an owner
    // with many objects gets a listing that misses this asset.
    const storage = new InMemoryStorageAdapter();
    await storage.store(`owner/${ID}.png`, BYTES, "image/png");
    vi.spyOn(storage, "list").mockResolvedValue({
      entries: [],
      commonPrefixes: []
    });
    const context = new ProcessingContext({
      jobId: "truncated-listing",
      userId: "owner",
      storage,
      fetchFn: async () => new Response(null, { status: 404 }),
      modelInterfaces: {
        getAssetInfo: async ({ userId, assetId }) =>
          userId === "owner" && assetId === ID
            ? { id: ID, name: "logo.png", content_type: "image/png", metadata: null }
            : null
      }
    });
    expect(await loadMediaRefBytes({ asset_id: ID }, context)).toEqual(BYTES);
  });

  it("refuses another owner's path before reading storage", async () => {
    const { context, storage, getAssetInfo } = await setup();
    const retrieve = vi.spyOn(storage, "retrieve");
    const uri = `asset://other/${ID}.wav`;
    expect(await loadMediaRefBytes({ type: "audio", uri }, context)).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
    expect(getAssetInfo).not.toHaveBeenCalledWith({
      userId: "owner",
      assetId: ID
    });
  });
});
