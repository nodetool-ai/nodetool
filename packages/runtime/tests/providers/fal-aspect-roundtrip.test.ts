import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FalProvider } from "../../src/providers/fal-provider.js";
import type { TextToImageParams } from "../../src/providers/types.js";

// Mock only the @fal-ai/client SDK — the manifest that drives model discovery
// AND request shaping is the REAL one. That's the whole point: prove the two
// sides agree, so the picker can only offer ratios the builder honors.
vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({ subscribe: vi.fn() }))
}));

/** True when the request carries a non-empty size signal fal can act on. */
function hasSizeSignal(input: Record<string, unknown>): boolean {
  const size = input.image_size;
  if (typeof size === "string" && size.length > 0) return true;
  if (size && typeof size === "object") {
    const { width, height } = size as { width?: number; height?: number };
    return Boolean(width && height);
  }
  const ar = input.aspect_ratio;
  return typeof ar === "string" && ar.length > 0;
}

/** Send one textToImage request and return the input handed to `subscribe`. */
async function captureInput(
  provider: FalProvider,
  modelId: string,
  ratio: string
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  (provider as unknown as { _client: unknown })._client = {
    subscribe: (_id: string, opts: { input: Record<string, unknown> }) => {
      captured = opts.input;
      return Promise.resolve({
        data: { images: [{ url: "https://fal.ai/result.png" }] }
      });
    }
  };
  const params: TextToImageParams = {
    prompt: "x",
    model: { id: modelId, name: modelId, provider: "fal_ai" },
    aspectRatio: ratio
  };
  try {
    await provider.textToImage(params);
  } catch {
    // Only the captured request input matters; downstream download is irrelevant.
  }
  return captured;
}

describe("FAL aspect-ratio round-trip", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x89, 0x50]).buffer)
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The extraction↔builder contract, checked EXHAUSTIVELY: for every image
  // model that reports aspect ratios, every reported ratio must produce a size
  // signal in the actual request. If it doesn't, the picker offers a ratio the
  // builder silently drops — the exact bug this feature prevents. (A curated
  // slice missed the gpt-image / glm-image / *:2 endpoints that regressed.)
  it("every reported aspect ratio produces a size signal for every constrained model", async () => {
    const provider = new FalProvider({ FAL_API_KEY: "k" });
    const models = await provider.getAvailableImageModels();
    const constrained = models.filter((m) => (m.aspectRatios?.length ?? 0) > 0);

    // Guard against a manifest change that silently empties every model's
    // constraints (which would make this test vacuously pass).
    expect(constrained.length).toBeGreaterThan(50);

    const broken: string[] = [];
    for (const m of constrained) {
      for (const ratio of m.aspectRatios ?? []) {
        const input = await captureInput(provider, m.id, ratio);
        if (!hasSizeSignal(input)) broken.push(`${m.id} @ ${ratio}`);
      }
    }

    expect(
      broken,
      `Models offer aspect ratios their request builder drops:\n  ${broken
        .slice(0, 40)
        .join("\n  ")}${broken.length > 40 ? `\n  …and ${broken.length - 40} more` : ""}`
    ).toEqual([]);
  });

  // A couple of explicit spot checks documenting the two size idioms.
  it("maps image_size-enum endpoints (flux) to the declared enum value", async () => {
    const provider = new FalProvider({ FAL_API_KEY: "k" });
    const input = await captureInput(provider, "fal-ai/flux/dev", "16:9");
    expect(input.image_size).toBe("landscape_16_9");
  });

  it("maps an explicit-dimension endpoint (gpt-image) to its own vocabulary", async () => {
    const provider = new FalProvider({ FAL_API_KEY: "k" });
    const models = await provider.getAvailableImageModels();
    const gpt = models.find((m) => m.id === "fal-ai/gpt-image-1.5");
    // Only assert when this endpoint ships in the manifest with 3:2 support.
    if (gpt?.aspectRatios?.includes("3:2")) {
      const input = await captureInput(provider, "fal-ai/gpt-image-1.5", "3:2");
      expect(hasSizeSignal(input)).toBe(true);
    }
  });
});
