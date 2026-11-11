import { describe, expect, it } from "vitest";
import { ImageToVideoNode, ReferenceToVideoNode } from "../src/nodes/video.js";

const image = (bytes: number[]) => ({
  type: "image",
  data: Buffer.from(bytes).toString("base64")
});

const video = (bytes: number[]) => ({
  type: "video",
  data: Buffer.from(bytes).toString("base64")
});

function context() {
  const requests: Array<Record<string, unknown>> = [];
  return {
    requests,
    value: {
      runProviderPrediction: async (request: Record<string, unknown>) => {
        requests.push(request);
        return new Uint8Array([9, 8, 7]);
      }
    }
  };
}

describe("ReferenceToVideoNode", () => {
  it("preserves ordered image and video references and rejects empty input", async () => {
    const node = new ReferenceToVideoNode();
    node.assign({
      model: { type: "video_model", provider: "fake", id: "r2v" },
      reference_images: [image([1]), image([2])],
      reference_videos: [video([3]), video([4])],
      prompt: "Use image 1 and video 2"
    });
    const run = context();
    await node.process(run.value as never);
    const params = run.requests[0].params as Record<string, unknown>;
    expect((params.reference_images as Uint8Array[]).map((bytes) => bytes[0])).toEqual([1, 2]);
    expect((params.reference_videos as Uint8Array[]).map((bytes) => bytes[0])).toEqual([3, 4]);
    expect(run.requests[0].capability).toBe("reference_to_video");

    const empty = new ReferenceToVideoNode();
    empty.assign({ model: { type: "video_model", provider: "fake", id: "r2v" } });
    await expect(empty.process(run.value as never)).rejects.toThrow(
      "requires at least one reference image or video"
    );
  });
});

describe("ReferenceToVideoNode — inline image mentions", () => {
  it("appends mentioned images after the wired references and numbers them in the prompt", async () => {
    const node = new ReferenceToVideoNode();
    node.assign({
      model: { type: "video_model", provider: "fake", id: "r2v" },
      reference_images: [image([1])],
      prompt: "Place image 1 on asset://bg.png with asset://deco.jpg beside it"
    });
    const run = context();
    const bytesByUri: Record<string, number> = { "asset://bg.png": 2, "asset://deco.jpg": 3 };
    const mentionContext = {
      ...run.value,
      resolveAssetBytes: async (uri: string) => ({ bytes: new Uint8Array([bytesByUri[uri] ?? 0]) })
    };
    await node.process(mentionContext as never);
    const params = run.requests[0].params as Record<string, unknown>;
    expect((params.reference_images as Uint8Array[]).map((bytes) => bytes[0])).toEqual([1, 2, 3]);
    expect(params.prompt).toBe("Place image 1 on image 2 with image 3 beside it");
  });

  it("uses mentioned images alone when no references are wired", async () => {
    const node = new ReferenceToVideoNode();
    node.assign({
      model: { type: "video_model", provider: "fake", id: "r2v" },
      prompt: "asset://product.png on a marble table"
    });
    const run = context();
    const mentionContext = {
      ...run.value,
      resolveAssetBytes: async () => ({ bytes: new Uint8Array([7]) })
    };
    await node.process(mentionContext as never);
    const params = run.requests[0].params as Record<string, unknown>;
    expect((params.reference_images as Uint8Array[]).map((bytes) => bytes[0])).toEqual([7]);
    expect(params.prompt).toBe("image 1 on a marble table");
  });
});

describe("ImageToVideoNode", () => {
  it("keeps only the first non-empty serialized image as the start frame", async () => {
    const node = new ImageToVideoNode();
    node.assign({
      model: { type: "video_model", provider: "fake", id: "i2v" },
      image: [image([]), image([5]), image([6])]
    });
    const run = context();
    await node.process(run.value as never);
    const params = run.requests[0].params as Record<string, unknown>;
    expect(Array.from(params.image as Uint8Array)).toEqual([5]);
  });

  it("does not resolve images after the first non-empty start frame", async () => {
    const node = new ImageToVideoNode();
    node.assign({
      model: { type: "video_model", provider: "fake", id: "i2v" },
      image: [image([5]), { type: "image", uri: "asset://unreachable" }]
    });
    const run = context();
    const resolvingContext = {
      ...run.value,
      resolveAssetBytes: async () => {
        throw new Error("later image should not be resolved");
      }
    };
    await node.process(resolvingContext as never);
    expect(run.requests).toHaveLength(1);
  });
});

describe("ReferenceToVideoNode — reference markers", () => {
  const promptFor = async (provider: string) => {
    const node = new ReferenceToVideoNode();
    node.assign({
      model: { type: "video_model", provider, id: "r2v" },
      reference_images: [image([1])],
      prompt: "Image 1 dances"
    });
    const run = context();
    await node.process(run.value as never);
    return (run.requests[0].params as Record<string, unknown>).prompt;
  };

  it("writes bracket markers for dreamina", async () => {
    expect(await promptFor("dreamina")).toBe("[Image 1] dances");
  });

  it("keeps plain markers for other providers", async () => {
    expect(await promptFor("fake")).toBe("Image 1 dances");
  });
});
