import { describe, it, expect } from "vitest";
import { ImageToVideoNode } from "@nodetool-ai/video-nodes";

const assetBytes = new Uint8Array([2, 4, 6, 8]);

function makeContext() {
  const captured: { req?: Record<string, unknown> } = {};
  const context = {
    resolveAssetBytes: async () => ({ bytes: assetBytes }),
    runProviderPrediction: async (req: Record<string, unknown>) => {
      captured.req = req;
      return new Uint8Array([9, 9, 9]);
    }
  };
  return { context, captured };
}

describe("ImageToVideoNode — inline asset prompt mapping", () => {
  it("routes an asset:// mention into the image input and strips it", async () => {
    const node = new ImageToVideoNode();
    node.assign({ prompt: "animate asset://a.png slowly" });

    const { context, captured } = makeContext();
    await node.process(context as never);

    const params = (captured.req as { params: Record<string, unknown> }).params;
    const images = params.images as Uint8Array[];
    expect(images).toHaveLength(1);
    expect(Array.from(images[0])).toEqual(Array.from(assetBytes));
    expect(params.prompt).toBe("animate image slowly");
  });

  it("keeps a wired image input but strips the mention", async () => {
    const node = new ImageToVideoNode();
    node.assign({
      prompt: "loop asset://a.png forever",
      image: {
        type: "image",
        data: Buffer.from([5, 5, 5]).toString("base64"),
        uri: ""
      }
    });

    const { context, captured } = makeContext();
    await node.process(context as never);

    const params = (captured.req as { params: Record<string, unknown> }).params;
    const images = params.images as Uint8Array[];
    expect(images).toHaveLength(1);
    expect(Array.from(images[0])).toEqual([5, 5, 5]);
    expect(params.prompt).toBe("loop forever");
  });
});
