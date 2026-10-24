import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  diffCatalog,
  matchesPattern,
  parseConfigIds,
  parseFalModelsPage,
  parseGeminiImageModels,
  parseGeminiShippedIds,
  parseReplicateCollection
} from "../provider-gaps/gaps.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("provider model gaps", () => {
  it("reads endpoint ids from a codegen config file", () => {
    const source = `export const config = {
  configs: {
    "ideogram/vector/text-to-vector": {
      className: "IdeogramVectorTextToVector",
      fieldOverrides: { "prompt": { description: "x" } }
    },
    "quiverai/arrow-1.1": { className: "Arrow_1_1", returnType: "image" }
  }
};`;
    expect(parseConfigIds(source)).toEqual([
      "ideogram/vector/text-to-vector",
      "quiverai/arrow-1.1"
    ]);
  });

  it("finds the ids the checked-in configs list", () => {
    expect(
      parseConfigIds(
        read("../../packages/fal-codegen/src/configs/text-to-image.ts")
      )
    ).toContain("ideogram/vector/text-to-vector");
    expect(
      parseConfigIds(
        read("../../packages/replicate-codegen/src/configs/image-generate.ts")
      )
    ).toContain("quiverai/arrow-1.1");
  });

  it("reads only the image models from the Gemini provider", () => {
    const ids = parseGeminiShippedIds(
      read("../../packages/runtime/src/providers/gemini-provider.ts")
    );
    expect(ids).toContain("gemini-nano-banana-2.1");
    expect(ids).toContain("gemini-3-pro-image");
    expect(ids.some((id) => id.includes("tts"))).toBe(false);
  });

  it("reports upstream ids that are neither shipped nor ignored", () => {
    const result = diffCatalog({
      upstream: ["a/one", "a/two", "a/two", "b/ws", "c/three"],
      shipped: ["a/one"],
      ignore: ["*/ws"]
    });
    expect(result).toEqual({ missing: ["a/two", "c/three"], ignored: 1 });
  });

  it("treats only `*` as a wildcard", () => {
    expect(matchesPattern("meta/llama-2-70b-chat", "meta/llama-2-*")).toBe(
      true
    );
    expect(matchesPattern("meta/llama-2x70b", "meta/llama-2-*")).toBe(false);
    expect(
      matchesPattern("google/nano-banana-2.1", "google/nano-banana-2.1")
    ).toBe(true);
    expect(
      matchesPattern("google/nano-banana-2x1", "google/nano-banana-2.1")
    ).toBe(false);
  });

  it("pages through the FAL catalog and drops deprecated endpoints", () => {
    expect(
      parseFalModelsPage({
        models: [
          {
            endpoint_id: "ideogram/vector/text-to-vector",
            metadata: { status: "active" }
          },
          { endpoint_id: "fal-ai/old", metadata: { status: "deprecated" } }
        ],
        has_more: true,
        next_cursor: "abc"
      })
    ).toEqual({ ids: ["ideogram/vector/text-to-vector"], nextCursor: "abc" });
    expect(
      parseFalModelsPage({ models: [], has_more: false, next_cursor: "x" })
        .nextCursor
    ).toBeNull();
  });

  it("reads Replicate collection models as owner/name", () => {
    expect(
      parseReplicateCollection({
        models: [{ owner: "quiverai", name: "arrow-1.1" }, { owner: "x" }]
      })
    ).toEqual(["quiverai/arrow-1.1"]);
  });

  it("keeps the Gemini image generators only", () => {
    expect(
      parseGeminiImageModels({
        models: [
          {
            name: "models/gemini-nano-banana-2.1",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "models/gemini-3-pro-image",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "models/gemini-3.8-flash",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "models/imagen-4.0-generate-001",
            supportedGenerationMethods: ["predict"]
          }
        ]
      })
    ).toEqual(["gemini-nano-banana-2.1", "gemini-3-pro-image"]);
  });
});
