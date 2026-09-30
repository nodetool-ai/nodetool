import { describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";
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
