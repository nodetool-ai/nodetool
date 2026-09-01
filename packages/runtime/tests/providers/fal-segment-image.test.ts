import { describe, it, expect, vi, afterEach } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import { providerCapabilities } from "../../src/providers/base-provider.js";
import type { SegmentImageParams } from "../../src/providers/types.js";

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({ subscribe: vi.fn() }))
}));

const SAM = "fal-ai/sam-3-1/image";

/** Distinct bytes per mask URL so the test can tell the downloads apart. */
function stubMaskDownloads(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      const tail = String(url).slice(-5).charCodeAt(0);
      return Promise.resolve({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([tail]).buffer)
      });
    })
  );
}

function providerWithResult(data: Record<string, unknown>) {
  const subscribe = vi.fn().mockResolvedValue({ data });
  const upload = vi.fn().mockResolvedValue("https://fal.media/files/src.png");
  const p = new FalProvider({ FAL_API_KEY: "key" });
  // SAFETY: the client is created lazily from the API key; the tests replace it
  // with a double rather than reaching fal.
  (p as unknown as { _client: unknown })._client = {
    subscribe,
    storage: { upload }
  };
  return { p, subscribe, upload };
}

// SAM 3.1 is concept-driven, so a real call to it always names a concept.
const baseParams: SegmentImageParams = {
  model: { id: SAM, name: "SAM 3.1", provider: "fal_ai" },
  prompt: "cat"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FalProvider.segmentImage", () => {
  it("advertises segment_image once the provider implements it", () => {
    const capabilities = providerCapabilities(new FalProvider({ FAL_API_KEY: "k" }));
    expect(capabilities).toContain("segment_image");
  });

  it("uploads the source image and asks for scores and boxes", async () => {
    stubMaskDownloads();
    const { p, subscribe, upload } = providerWithResult({
      masks: [{ url: "https://fal.ai/mask-a.png", width: 800, height: 600 }]
    });

    await p.segmentImage(new Uint8Array([1, 2, 3, 4]), {
      ...baseParams,
      prompt: "blood",
      maxMasks: 3
    });

    expect(upload).toHaveBeenCalledTimes(1);
    const input = subscribe.mock.calls[0][1].input;
    expect(input.image_url).toBe("https://fal.media/files/src.png");
    expect(input.prompt).toBe("blood");
    expect(input.max_masks).toBe(3);
    expect(input.return_multiple_masks).toBe(true);
    expect(input.include_scores).toBe(true);
    expect(input.include_boxes).toBe(true);
    // The mask images are the answer; a masked copy of the source is not.
    expect(input.apply_mask).toBe(false);
  });

  it("sends point prompts as fal's label encoding", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({ masks: [] });

    await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      points: [
        { x: 10.4, y: 20.6, include: true },
        { x: 30, y: 40, include: false }
      ]
    });

    expect(subscribe.mock.calls[0][1].input.point_prompts).toEqual([
      { x: 10, y: 21, label: 1 },
      { x: 30, y: 40, label: 0 }
    ]);
  });

  it("sends a box prompt as corners, not an origin and a size", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({ masks: [] });

    await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      box: { x: 10, y: 20, width: 30, height: 40 }
    });

    expect(subscribe.mock.calls[0][1].input.box_prompts).toEqual([
      { x_min: 10, y_min: 20, x_max: 40, y_max: 60 }
    ]);
  });

  it("returns one mask per image with its label, score and pixel box", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      masks: [
        { url: "https://fal.ai/mask-a.png", width: 800, height: 600 },
        { url: "https://fal.ai/mask-b.png", width: 800, height: 600 }
      ],
      // fal sends these side-channels as JSON text.
      scores: JSON.stringify([0.91, 0.42]),
      metadata: JSON.stringify([{ label: "dog" }, { label: "cat" }]),
      boxes: JSON.stringify([
        [0.5, 0.5, 0.5, 0.5],
        [0.25, 0.25, 0.5, 0.5]
      ])
    });

    const masks = await p.segmentImage(new Uint8Array([1]), baseParams);

    expect(masks).toHaveLength(2);
    expect(masks[0].label).toBe("dog");
    expect(masks[0].confidence).toBe(0.91);
    expect(masks[0].mimeType).toBe("image/png");
    expect(masks[0].mask.length).toBeGreaterThan(0);
    // Normalized [cx, cy, w, h] over an 800×600 mask.
    expect(masks[0].box).toEqual({ x: 200, y: 150, width: 400, height: 300 });
    expect(masks[1].box).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("drops masks below minConfidence", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      masks: [
        { url: "https://fal.ai/mask-a.png", width: 8, height: 6 },
        { url: "https://fal.ai/mask-b.png", width: 8, height: 6 }
      ],
      scores: JSON.stringify([0.9, 0.2])
    });

    const masks = await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      minConfidence: 0.5
    });

    expect(masks).toHaveLength(1);
    expect(masks[0].confidence).toBe(0.9);
  });

  it("keeps an unscored mask rather than guessing a confidence", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      masks: [{ url: "https://fal.ai/mask-a.png", width: 8, height: 6 }]
    });

    const masks = await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      minConfidence: 0.5
    });

    expect(masks).toHaveLength(1);
    expect(masks[0].confidence).toBeNull();
    expect(masks[0].box).toBeNull();
  });

  it("falls back to the single preview image when the endpoint returns no mask list", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      image: { url: "https://fal.ai/only.png", width: 100, height: 100 }
    });

    const masks = await p.segmentImage(new Uint8Array([1]), baseParams);

    expect(masks).toHaveLength(1);
  });

  it("returns nothing when the model found nothing", async () => {
    const { p } = providerWithResult({ masks: [] });
    await expect(p.segmentImage(new Uint8Array([1]), baseParams)).resolves.toEqual([]);
  });

  it("refuses a concept model a point prompt cannot drive", async () => {
    const { p, subscribe } = providerWithResult({ masks: [] });

    await expect(
      p.segmentImage(new Uint8Array([1]), {
        model: { id: SAM, name: "SAM 3.1", provider: "fal_ai" },
        points: [{ x: 10, y: 20, include: true }]
      })
    ).rejects.toThrow(/segments by concept/);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("lets a point-driven model take a point prompt with no concept", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({
      image: { url: "https://fal.ai/mask-a.png", width: 10, height: 10 }
    });

    await p.segmentImage(new Uint8Array([1]), {
      model: { id: "fal-ai/sam2/image", name: "SAM2", provider: "fal_ai" },
      points: [{ x: 10, y: 20, include: true }]
    });

    expect(subscribe).toHaveBeenCalled();
  });

  it("refuses an empty image instead of paying for the call", async () => {
    const { p, subscribe } = providerWithResult({ masks: [] });
    await expect(p.segmentImage(new Uint8Array(), baseParams)).rejects.toThrow(
      /non-empty image/
    );
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("reads sam2/auto-segment's individual_masks", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      individual_masks: [
        { url: "https://fal.ai/mask-a.png", width: 8, height: 6 },
        { url: "https://fal.ai/mask-b.png", width: 8, height: 6 }
      ],
      combined_mask: "https://fal.ai/all.png"
    });

    const masks = await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      model: {
        id: "fal-ai/sam2/auto-segment",
        name: "SAM2 Auto",
        provider: "fal_ai"
      }
    });

    expect(masks).toHaveLength(2);
  });

  it("reads birefnet's single mask_image", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      mask_image: { url: "https://fal.ai/mask.png", width: 8, height: 6 }
    });

    const masks = await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      model: { id: "fal-ai/birefnet", name: "BiRefNet", provider: "fal_ai" }
    });

    expect(masks).toHaveLength(1);
  });

  it("writes the text prompt to the field the endpoint declares", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({ masks: [] });

    // florence's referring-expression endpoint calls it `text_input`.
    await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      model: {
        id: "fal-ai/florence-2-large/referring-expression-segmentation",
        name: "Florence 2",
        provider: "fal_ai"
      },
      prompt: "the hand"
    });

    const input = subscribe.mock.calls[0][1].input;
    expect(input.text_input).toBe("the hand");
    expect(input.prompt).toBeUndefined();
  });

  it("writes point prompts to sam2/image's `prompts` field", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({ masks: [] });

    await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      model: { id: "fal-ai/sam2/image", name: "SAM2", provider: "fal_ai" },
      points: [{ x: 1, y: 2, include: true }]
    });

    const input = subscribe.mock.calls[0][1].input;
    expect(input.prompts).toEqual([{ x: 1, y: 2, label: 1 }]);
    expect(input.point_prompts).toBeUndefined();
  });

  it("sends no prompt at all to an endpoint that declares none", async () => {
    stubMaskDownloads();
    const { p, subscribe } = providerWithResult({ individual_masks: [] });

    // sam2/auto-segment takes an image and nothing else.
    await p.segmentImage(new Uint8Array([1]), {
      ...baseParams,
      model: {
        id: "fal-ai/sam2/auto-segment",
        name: "SAM2 Auto",
        provider: "fal_ai"
      },
      prompt: "hand",
      points: [{ x: 1, y: 2, include: true }]
    });

    const input = subscribe.mock.calls[0][1].input;
    expect(input.prompt).toBeUndefined();
    expect(input.point_prompts).toBeUndefined();
    expect(input.prompts).toBeUndefined();
    expect(input.image_url).toBeTruthy();
  });

  it("reads a mask list of bare URL strings", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      individual_masks: ["https://fal.ai/a.png", "https://fal.ai/b.png"]
    });

    const masks = await p.segmentImage(new Uint8Array([1]), baseParams);

    expect(masks).toHaveLength(2);
    // Nothing reported a size; say so rather than inventing one.
    expect(masks[0].width).toBeNull();
  });

  it("falls back to combined_mask when the per-object list is empty", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      individual_masks: [],
      combined_mask: "https://fal.ai/all.png"
    });

    const masks = await p.segmentImage(new Uint8Array([1]), baseParams);

    expect(masks).toHaveLength(1);
  });

  it("reads a mask nested one level down", async () => {
    stubMaskDownloads();
    const { p } = providerWithResult({
      image: { image: { url: "https://fal.ai/nested.png", width: 4, height: 4 } }
    });

    const masks = await p.segmentImage(new Uint8Array([1]), baseParams);

    expect(masks).toHaveLength(1);
    expect(masks[0].width).toBe(4);
  });
});
