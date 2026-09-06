import { describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext } from "../src/context.js";

describe("ProcessingContext temp URL reuse", () => {
  it("reuses an existing storage URL without fetching or copying it", async () => {
    const storage = new InMemoryStorageAdapter();
    const store = vi.spyOn(storage, "store");
    const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const context = new ProcessingContext({
      jobId: "reuse-existing-storage-url",
      assetOutputMode: "temp_url",
      storage,
      fetchFn
    });

    const normalized = (await context.normalizeOutputValue({
      image: {
        type: "ImageRef",
        uri: "/api/storage/input.png",
        data: null
      }
    })) as {
      image: { uri: string; data?: unknown };
    };

    expect(normalized.image.uri).toBe("/api/storage/input.png");
    expect(normalized.image.data).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});
