/**
 * Request parity for the Replicate transport (docs/plans/provider-endpoint-interface.md,
 * Testing strategy item 4). Three manifest nodes, one per media output, run
 * with the same properties, and the model id, input JSON and uploads they send
 * are pinned below. The fixtures were recorded against the pack's former SDK
 * transport (`replicate.run()` and `files.create()` in the node) and must stay
 * unchanged now that the nodes call the runtime provider.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";

const { createReplicateNodeClass } = await import("../src/replicate-factory.js");
const { default: manifest } = await import("../src/replicate-manifest.json", {
  with: { type: "json" }
});
type ManifestEntry = Parameters<typeof createReplicateNodeClass>[0];

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WAV = Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0]);
const ASSET_BYTES: Record<string, Uint8Array> = {
  "asset://img-1": PNG,
  "asset://img-2": PNG,
  "asset://aud-1": WAV
};

interface ParityCase {
  className: string;
  properties: Record<string, unknown>;
  /** What the vendor answers, as plain JSON. */
  output: unknown;
  expected: {
    model: string;
    input: Record<string, unknown>;
    uploads: Array<{ mimeType: string; filename: string; size: number }>;
    nodeOutput: unknown;
  };
}

const CASES: ParityCase[] = [
  {
    className: "Flux_2_Pro",
    properties: {
      prompt: "a red cube",
      aspect_ratio: "16:9",
      seed: 7,
      input_images: [
        { type: "image", uri: "asset://img-1" },
        { type: "image", uri: "https://replicate.delivery/in/ref.png" }
      ]
    },
    output: "https://replicate.delivery/out/flux.webp",
    expected: {
      model: "black-forest-labs/flux-2-pro",
      input: {
        aspect_ratio: "16:9",
        input_images: [
          "https://replicate.delivery/uploads/1/upload.png",
          "https://replicate.delivery/in/ref.png"
        ],
        output_format: "webp",
        output_quality: 80,
        prompt: "a red cube",
        resolution: "1 MP",
        safety_tolerance: 2,
        seed: 7
      },
      uploads: [{ mimeType: "image/png", filename: "upload.png", size: 8 }],
      nodeOutput: {
        type: "image",
        uri: "https://replicate.delivery/out/flux.webp"
      }
    }
  },
  {
    className: "Veo_3_1",
    properties: {
      prompt: "a fox runs",
      image: {
        type: "image",
        uri: "",
        data: Buffer.from(PNG).toString("base64")
      },
      last_frame: { type: "image", uri: "", asset_id: "img-2" },
      negative_prompt: "",
      duration: 6
    },
    output: ["https://replicate.delivery/out/veo.mp4"],
    expected: {
      model: "google/veo-3.1",
      input: {
        aspect_ratio: "16:9",
        duration: 6,
        generate_audio: true,
        image: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
        last_frame: "https://replicate.delivery/uploads/1/upload.png",
        prompt: "a fox runs",
        resolution: "1080p",
        seed: -1
      },
      uploads: [{ mimeType: "image/png", filename: "upload.png", size: 8 }],
      nodeOutput: {
        type: "video",
        uri: "https://replicate.delivery/out/veo.mp4"
      }
    }
  },
  {
    className: "MusicGen",
    properties: {
      prompt: "lofi beat",
      duration: 12,
      input_audio: { type: "audio", uri: "asset://aud-1" }
    },
    output: { audio: "https://replicate.delivery/out/music.wav" },
    expected: {
      model: "meta/musicgen",
      input: {
        classifier_free_guidance: 3,
        continuation: false,
        continuation_end: 0,
        continuation_start: 0,
        duration: 12,
        input_audio: "https://replicate.delivery/uploads/1/upload.wav",
        model_version: "stereo-melody-large",
        multi_band_diffusion: false,
        normalization_strategy: "loudness",
        output_format: "wav",
        prompt: "lofi beat",
        seed: -1,
        temperature: 1,
        top_k: 250,
        top_p: 0
      },
      uploads: [{ mimeType: "audio/wav", filename: "upload.wav", size: 8 }],
      nodeOutput: {
        type: "audio",
        uri: "https://replicate.delivery/out/music.wav"
      }
    }
  }
];

async function runCase(c: ParityCase) {
  const provider = new ScriptedProvider([], {
    providerId: "replicate",
    endpoints: { "*": { output: c.output, requestId: "pred-parity" } },
    uploadUrl: (upload, n) =>
      `https://replicate.delivery/uploads/${n}/${upload.filename}`
  });
  const ctx = new ProcessingContext({ jobId: "parity-job" });
  ctx.setProviderResolver(async () => provider);
  vi.spyOn(ctx, "resolveAssetBytes").mockImplementation(async (uri) => ({
    bytes: ASSET_BYTES[uri] ?? null,
    attempts: []
  }));

  const spec = (manifest as ManifestEntry[]).find(
    (entry) => entry.className === c.className
  )!;
  const node = new (createReplicateNodeClass(spec))({});
  Object.assign(node, c.properties);
  const result = await node.process(ctx);

  expect(provider.endpointCalls).toHaveLength(1);
  const [call] = provider.endpointCalls;
  expect(call.route).toBeUndefined();
  return {
    model: call.model,
    input: call.input,
    uploads: provider.uploadCalls.map((u) => ({
      mimeType: u.mimeType,
      filename: u.filename,
      size: u.bytes.length
    })),
    nodeOutput: result.output
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Replicate transport request parity", () => {
  for (const c of CASES) {
    it(`${c.className} sends the pinned request`, async () => {
      expect(await runCase(c)).toEqual(c.expected);
    });
  }
});
