/**
 * Veo content-filter refusals reach the caller as ContentFilterRefusal.
 *
 * A filtered take leaves the long-running operation *successful* with no
 * samples in it, so without the RAI fields the caller only ever saw "No video
 * URI in response" — a hard error, which fails the node and discards whatever
 * the rest of a fan-out already generated and paid for.
 */

import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini-provider.js";
import { isContentFilterRefusalError } from "../../src/providers/content-filter.js";
import type { VideoModel } from "../../src/providers/types.js";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function providerReturning(operation: unknown): GeminiProvider {
  const fetchFn = vi.fn(async () =>
    jsonResponse(operation)
  ) as unknown as typeof fetch;
  return new GeminiProvider(
    { GEMINI_API_KEY: "k" },
    { fetchFn, sleepFn: async () => {} }
  );
}

const IMAGE = new Uint8Array([1, 2, 3, 4]);
const MODEL: VideoModel = {
  id: "veo-3.1-generate-preview",
  name: "Veo 3.1",
  provider: "gemini"
};

describe("Veo content-filter refusals", () => {
  it("raises a refusal when every take was RAI-filtered", async () => {
    const provider = providerReturning({
      name: "operations/1",
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [],
          raiMediaFilteredCount: 1,
          raiMediaFilteredReasons: [
            "58061214: Your prompt was flagged by Responsible AI"
          ]
        }
      }
    });

    const error = await provider
      .imageToVideo([IMAGE], { model: MODEL, prompt: "a lighthouse in a storm" })
      .catch((err: unknown) => err);

    expect(isContentFilterRefusalError(error)).toBe(true);
    expect((error as Error).message).toContain("58061214");
  });

  it("raises a refusal from the operation's error slot", async () => {
    const provider = providerReturning({
      name: "operations/2",
      done: true,
      error: {
        code: 400,
        message:
          "videos were filtered out because they violated Vertex AI's usage guidelines"
      }
    });

    const error = await provider
      .textToVideo({ model: MODEL, prompt: "a lighthouse in a storm" })
      .catch((err: unknown) => err);

    expect(isContentFilterRefusalError(error)).toBe(true);
  });

  it("keeps an empty response without RAI fields a hard error", async () => {
    const provider = providerReturning({
      name: "operations/3",
      done: true,
      response: { generateVideoResponse: { generatedSamples: [] } }
    });

    const error = await provider
      .textToVideo({ model: MODEL, prompt: "a lighthouse in a storm" })
      .catch((err: unknown) => err);

    expect(isContentFilterRefusalError(error)).toBe(false);
    expect((error as Error).message).toBe("No video URI in response");
  });
});
