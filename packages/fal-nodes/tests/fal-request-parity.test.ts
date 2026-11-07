/**
 * Request parity for the FAL transport move (plan Testing item 4).
 *
 * The pinned requests below were recorded from the pack's own transport
 * (`@fal-ai/client` storage upload plus the queue POST) before the nodes moved
 * to `context.callProviderEndpoint`. The migrated nodes must send the same
 * endpoint and the same input JSON.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import { loadFalNodesFromManifest } from "../src/fal-factory.js";
import type { FalManifestEntry } from "../src/fal-factory.js";
import manifest from "../src/fal-manifest.json" with { type: "json" };

const upload = vi.fn(
  async (_blob: Blob) => `https://v3.fal.media/files/uploaded-${upload.mock.calls.length}.bin`
);

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    queue: {},
    subscribe: vi.fn(),
    storage: { upload }
  }))
}));

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

interface WireRequest {
  endpoint: string;
  input: Record<string, unknown>;
}

/** Answers the FAL queue protocol and records each submission body. */
function stubQueue(result: Record<string, unknown>): WireRequest[] {
  const sent: WireRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === "POST") {
        sent.push({
          endpoint: new URL(href).pathname.slice(1),
          input: JSON.parse(String(init.body)) as Record<string, unknown>
        });
        return Response.json({ request_id: "req-parity" });
      }
      if (href.endsWith("/status")) {
        return Response.json({ status: "COMPLETED" });
      }
      if (href.includes("/requests/req-parity")) {
        return Response.json(result);
      }
      throw new Error(`unexpected fetch ${href}`);
    })
  );
  return sent;
}

function context(): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "job-parity" });
  ctx.setProviderResolver(
    async () => new ScriptedProvider([], { providerId: "fal_ai" })
  );
  return ctx;
}

describe("FAL request parity", () => {
  beforeEach(() => {
    upload.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the pinned FluxDev request", async () => {
    const sent = stubQueue({
      images: [{ url: "https://v3.fal.media/files/out.jpg" }]
    });
    const NodeClass = nodeClass("fal-ai/flux/dev");

    const result = await new NodeClass({}).toExecutor().process(
      {
        _secrets: { FAL_API_KEY: "test-key" },
        prompt: "a red fox in snow",
        seed: 42
      },
      context()
    );

    expect(sent).toEqual([FLUX_DEV_REQUEST]);
    expect(result.output).toMatchObject({
      type: "image",
      uri: "https://v3.fal.media/files/out.jpg"
    });
  });

  it("uploads the video and sends the pinned AMTInterpolation request", async () => {
    const sent = stubQueue({
      video: { url: "https://v3.fal.media/files/out.mp4" }
    });
    const NodeClass = nodeClass("fal-ai/amt-interpolation");

    const result = await new NodeClass({}).toExecutor().process(
      {
        _secrets: { FAL_API_KEY: "test-key" },
        video: {
          type: "video",
          uri: "",
          data: Buffer.from(VIDEO_BYTES).toString("base64")
        }
      },
      context()
    );

    expect(upload).toHaveBeenCalledOnce();
    const blob = upload.mock.calls[0][0];
    expect(blob.type).toBe("video/mp4");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(VIDEO_BYTES);
    expect(sent).toEqual([AMT_INTERPOLATION_REQUEST]);
    expect(result.output).toEqual({
      type: "video",
      uri: "https://v3.fal.media/files/out.mp4"
    });
  });
});
