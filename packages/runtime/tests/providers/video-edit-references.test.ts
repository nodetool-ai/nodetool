import { describe, expect, it, vi } from "vitest";
import Replicate from "replicate";
import { createFalClient } from "@fal-ai/client";
import { FalProvider } from "../../src/providers/fal-provider.js";
import { ReplicateProvider } from "../../src/providers/replicate-provider.js";
import { buildVideoModels } from "../../src/providers/manifest-models.js";

vi.mock("@fal-ai/client", () => ({ createFalClient: vi.fn() }));
const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const video = new Uint8Array([1, 2, 3]);

describe("video edit reference model matching", () => {
  it("requires a source video and one unambiguous reference image role", () => {
    const source = { name: "video_url", propType: "video", required: true };
    const reference = { name: "reference_images", propType: "list[image]" };
    const entries = [
      [source, reference],
      [source, { name: "image_url", propType: "image" }],
      [reference],
      [source, reference, { name: "subject_image", propType: "image" }]
    ].map((inputFields, i) => ({ endpointId: `edit-${i}`, outputType: "video", supportedTasks: ["video_to_video"], inputFields }));
    expect(buildVideoModels(entries, "fal_ai").map((model) => model.supportedTasks?.includes("video_to_video_reference"))).toEqual([true, false, false, false]);
  });
});

describe("provider video edit reference mapping", () => {
  it("maps FAL reference images separately from the source video", async () => {
    const upload = vi.fn(async (blob: Blob) => `https://fal.test/${blob.type}`);
    const subscribe = vi.fn().mockResolvedValue({ data: { video: { url: "https://fal.test/out.mp4" } } });
    vi.mocked(createFalClient).mockReturnValue({ subscribe, storage: { upload } } as unknown as ReturnType<typeof createFalClient>); // Only the exercised SDK boundaries are needed.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), arrayBuffer: async () => new Uint8Array([9]).buffer }));
    const provider = new FalProvider({ FAL_API_KEY: "test" });
    await provider.videoToVideo(video, {
      model: { id: "fal-ai/wan/v2.7/edit-video", name: "Edit", provider: "fal_ai" },
      prompt: "Keep the subject", referenceImages: [image]
    });
    expect(subscribe.mock.calls[0][1].input).toMatchObject({
      video_url: "https://fal.test/video/mp4", reference_image_url: "https://fal.test/image/png"
    });
  });

  it("maps Replicate's singular reference image without changing the video", async () => {
    const run = vi.spyOn(Replicate.prototype, "run").mockResolvedValue(["data:video/mp4;base64,CQ=="]);
    const provider = new ReplicateProvider({ REPLICATE_API_TOKEN: "test" });
    await provider.videoToVideo(video, {
      model: { id: "decart/lucy-edit-2", name: "Lucy", provider: "replicate" },
      prompt: "Keep the subject", referenceImages: [image]
    });
    expect(run.mock.calls[0][1].input).toMatchObject({
      video: "data:video/mp4;base64,AQID", reference_image: `data:image/png;base64,${Buffer.from(image).toString("base64")}`
    });
  });

  it("rejects unsupported FAL references before upload", async () => {
    const client = vi.mocked(createFalClient);
    client.mockClear();
    await expect(new FalProvider({ FAL_API_KEY: "test" }).videoToVideo(video, {
      model: { id: "unsupported", name: "Unsupported", provider: "fal_ai" }, referenceImages: [image]
    })).rejects.toThrow(/reference images/);
    expect(client).not.toHaveBeenCalled();
  });
});
