/**
 * Request parity for the FAL transport move (plan Testing item 4).
 *
 * The pinned requests below were recorded from the pack's own transport
 * (`@fal-ai/client` storage upload plus the queue POST) before the nodes moved
 * to `context.callProviderEndpoint`, in commit 5d5af278ff. The migrated nodes
 * must send the same endpoint, no route, the same input JSON and the same
 * upload.
 */
import { describe, expect, it } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import { loadFalNodesFromManifest } from "../src/fal-factory.js";
import type { FalManifestEntry } from "../src/fal-factory.js";
import manifest from "../src/fal-manifest.json" with { type: "json" };

const VIDEO_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

/** What the pack sent for fal.text_to_image.FluxDev before the move. */
const FLUX_DEV_REQUEST = {
  endpoint: "fal-ai/flux/dev",
  input: {
    num_images: 1,
    guidance_scale: 3.5,
    enable_safety_checker: true,
    seed: 42,
    image_size: "landscape_4_3",
    acceleration: "none",
    output_format: "jpeg",
    num_inference_steps: 28,
    sync_mode: false,
    prompt: "a red fox in snow"
  }
};

/** What the pack sent for fal.video_to_video.AMTInterpolation before the move. */
const AMT_INTERPOLATION_REQUEST = {
  endpoint: "fal-ai/amt-interpolation",
  input: {
    output_fps: 24,
    video_url: "https://v3.fal.media/files/uploaded-1.bin",
    recursive_interpolation_passes: 2
  }
};

function nodeClass(endpointId: string) {
  const entry = (manifest as FalManifestEntry[]).find(
    (spec) => spec.endpointId === endpointId
  );
  if (!entry) throw new Error(`${endpointId} is not in the manifest`);
  const [NodeClass] = loadFalNodesFromManifest([entry]);
  return NodeClass;
}

function scripted(
  endpoint: string,
  output: Record<string, unknown>
): { provider: ScriptedProvider; ctx: ProcessingContext } {
  const provider = new ScriptedProvider([], {
    providerId: "fal_ai",
    endpoints: { [endpoint]: { output, requestId: "req-parity" } },
    uploadUrl: (_upload, n) => `https://v3.fal.media/files/uploaded-${n}.bin`
  });
  const ctx = new ProcessingContext({ jobId: "job-parity" });
  ctx.setProviderResolver(async () => provider);
  return { provider, ctx };
}

/** The endpoint calls the provider received, in the pinned shape. */
function sent(provider: ScriptedProvider) {
  return provider.endpointCalls.map((call) => ({
    endpoint: call.model,
    input: call.input,
    ...(call.route === undefined ? {} : { route: call.route })
  }));
}

describe("FAL request parity", () => {
  it("sends the pinned FluxDev request", async () => {
    const { provider, ctx } = scripted("fal-ai/flux/dev", {
      images: [{ url: "https://v3.fal.media/files/out.jpg" }]
    });
    const NodeClass = nodeClass("fal-ai/flux/dev");

    const result = await new NodeClass({})
      .toExecutor()
      .process({ prompt: "a red fox in snow", seed: 42 }, ctx);

    expect(sent(provider)).toEqual([FLUX_DEV_REQUEST]);
    expect(result.output).toMatchObject({
      type: "image",
      uri: "https://v3.fal.media/files/out.jpg"
    });
  });

  it("uploads the video and sends the pinned AMTInterpolation request", async () => {
    const { provider, ctx } = scripted("fal-ai/amt-interpolation", {
      video: { url: "https://v3.fal.media/files/out.mp4" }
    });
    const NodeClass = nodeClass("fal-ai/amt-interpolation");

    const result = await new NodeClass({}).toExecutor().process(
      {
        video: {
          type: "video",
          uri: "",
          data: Buffer.from(VIDEO_BYTES).toString("base64")
        }
      },
      ctx
    );

    expect(provider.uploadCalls).toHaveLength(1);
    expect(provider.uploadCalls[0].mimeType).toBe("video/mp4");
    expect(provider.uploadCalls[0].bytes).toEqual(VIDEO_BYTES);
    expect(sent(provider)).toEqual([AMT_INTERPOLATION_REQUEST]);
    expect(result.output).toEqual({
      type: "video",
      uri: "https://v3.fal.media/files/out.mp4"
    });
  });
});
