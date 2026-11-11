import { describe, expect, it } from "vitest";
import { loadCanvas } from "@nodetool-ai/runtime";
import type { Canvas2DLayer } from "@nodetool-ai/timeline/scene";

import { createSharedPreviewCompositor } from "../src/timeline-preview/shared-compositor.js";
import { MAX_RENDER_BYTES, type RenderChildRequest } from "../src/timeline-preview/render-child-client.js";

describe("shared preview compositor source budget", () => {
  it("scales a busy full-frame stack under the transfer limit instead of failing", async () => {
    const { createCanvas } = await loadCanvas();
    const W = 1080, H = 1920;
    const requests: RenderChildRequest[] = [];
    const compositor = await createSharedPreviewCompositor(W, H, W, H, undefined, {
      render: async (request) => {
        requests.push(request);
        return { pixels: new Uint8Array(W * H * 4), skippedLayerIds: [], effectsNotApplied: [] };
      },
      dispose: async () => undefined
    });
    // Twelve text-like layers, each a full-frame raster: about 95 MiB of sources.
    const layers = Array.from({ length: 12 }, (_, index) => ({
      clipId: `l${index}`,
      source: createCanvas(W, H),
      sourceWidth: W,
      sourceHeight: H,
      opacity: 1,
      blendMode: "normal",
      zIndex: index
    })) as unknown as Canvas2DLayer<never>[];
    await compositor.draw(createCanvas(W, H), layers, [], []);
    const sent = requests[0]!.layers;
    const bytes = sent.reduce((sum, layer) => sum + layer.source.rgba.byteLength, 0);
    expect(bytes).toBeLessThanOrEqual(MAX_RENDER_BYTES);
    expect(sent[0]!.source.width).toBeLessThan(W);
    // The layer keeps its full-size geometry; only its pixels shrink.
    expect(sent[0]!.sourceWidth).toBe(W);
  });
});
