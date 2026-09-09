import { describe, expect, it } from "vitest";
import { NodetoolProvider } from "../../src/providers/nodetool-provider.js";

const model = (id: string) => ({
  id,
  name: id,
  provider: "nodetool" as const
});

describe("NodetoolProvider task routing", () => {
  it("routes text-to-image through the catalog's default delegate", async () => {
    const provider = new NodetoolProvider();
    await expect(
      provider.textToImage({ model: model("nodetool/flux-schnell"), prompt: "cat" })
    ).rejects.toThrow(/missing NODETOOL_PLATFORM_FAL_KEY/);
  });

  it("rejects a video model without reference_to_video before delegation", async () => {
    const provider = new NodetoolProvider();
    await expect(
      provider.referenceToVideo(
        { images: [new Uint8Array([1])], videos: [] },
        { model: model("nodetool/hailuo-fast"), prompt: "cat" }
      )
    ).rejects.toThrow(/does not support reference_to_video/);
  });
});
