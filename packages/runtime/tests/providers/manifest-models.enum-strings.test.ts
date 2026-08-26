/**
 * The manifests are JSON, so a field declared `string[]` in the reader's types
 * is a claim about the data rather than a guarantee. FAL's two LoRA trainers
 * declare `resolution` as an enum of numbers; those reached
 * `unifiedModel.resolutions` (`z.array(z.string())`) and failed tRPC output
 * validation for the whole `models.imageByProvider` query, which showed up as
 * a console error on the settings page.
 *
 * Run with:
 *   npm run test --workspace=packages/runtime -- manifest-models.enum-strings
 */
import { describe, it, expect } from "vitest";
import {
  enumValuesFor,
  imageConstraints,
  videoConstraints
} from "../../src/providers/manifest-models.js";
import { FalProvider } from "../../src/providers/fal-provider.js";
import { unifiedModel } from "@nodetool-ai/protocol/api-schemas/models.js";

/** A node whose enum values are numbers, as the trainers' really are. */
const numericEnumNode = {
  endpointId: "vendor/numeric-enum",
  className: "NumericEnum",
  outputType: "image" as const,
  inputFields: [
    {
      name: "resolution",
      propType: "enum",
      // The manifest genuinely holds numbers here; the cast is the point.
      enumValues: [768, 1024] as unknown as string[]
    }
  ]
};

describe("enumValuesFor", () => {
  it("stringifies a numeric enum declared on an input field", () => {
    expect(enumValuesFor(numericEnumNode, "resolution")).toEqual([
      "768",
      "1024"
    ]);
  });

  it("stringifies a numeric enum declared the Kie way", () => {
    const node = {
      endpointId: "vendor/kie-numeric",
      className: "KieNumeric",
      outputType: "image" as const,
      fields: [
        {
          name: "resolution",
          values: [512, 1024] as unknown as string[]
        }
      ]
    };
    expect(enumValuesFor(node, "resolution")).toEqual(["512", "1024"]);
  });

  it("leaves string enums as they are", () => {
    const node = {
      endpointId: "vendor/string-enum",
      className: "StringEnum",
      outputType: "image" as const,
      inputFields: [
        { name: "resolution", propType: "enum", enumValues: ["720p", "1080p"] }
      ]
    };
    expect(enumValuesFor(node, "resolution")).toEqual(["720p", "1080p"]);
  });

  it("carries the coercion into image and video constraints", () => {
    expect(imageConstraints(numericEnumNode).resolutions).toEqual([
      "768",
      "1024"
    ]);
    const video = videoConstraints({
      endpointId: "vendor/numeric-duration",
      className: "NumericDuration",
      outputType: "video" as const,
      inputFields: [
        {
          name: "duration",
          propType: "enum",
          enumValues: [5, 10] as unknown as string[]
        },
        {
          name: "resolution",
          propType: "enum",
          enumValues: [720, 1080] as unknown as string[]
        }
      ]
    });
    // Durations are read back as numbers, so stringifying first must not
    // change what the video picker gets.
    expect(video.durations).toEqual([5, 10]);
    expect(video.resolutions).toEqual(["720", "1080"]);
  });
});

describe("every shipped FAL media model satisfies the wire schema", () => {
  /** The mapping `models.imageByProvider` applies before tRPC validates. */
  function asUnified(
    model: Record<string, unknown>,
    type: string
  ): Record<string, unknown> {
    return {
      id: model["id"],
      type,
      name: model["name"],
      provider: model["provider"],
      repo_id: null,
      path: null,
      downloaded: false,
      tags: [model["provider"]],
      supported_tasks: model["supportedTasks"] ?? null,
      durations: model["durations"] ?? null,
      resolutions: model["resolutions"] ?? null,
      aspect_ratios: model["aspectRatios"] ?? null
    };
  }

  const provider = new FalProvider({ apiKey: "not-used-for-listing" });

  it("validates every image model, and finds some to validate", async () => {
    const models = (await provider.getAvailableImageModels()) as unknown as Array<
      Record<string, unknown>
    >;
    expect(models.length).toBeGreaterThan(100);
    const failures = models
      .map((m) => ({ id: m["id"], parsed: unifiedModel.safeParse(asUnified(m, "image_model")) }))
      .filter((r) => !r.parsed.success)
      .map((r) => `${String(r.id)}: ${JSON.stringify(r.parsed.error?.issues)}`);
    expect(failures).toEqual([]);
  });

  it("validates every video model", async () => {
    const models = (await provider.getAvailableVideoModels()) as unknown as Array<
      Record<string, unknown>
    >;
    expect(models.length).toBeGreaterThan(100);
    const failures = models
      .map((m) => ({ id: m["id"], parsed: unifiedModel.safeParse(asUnified(m, "video_model")) }))
      .filter((r) => !r.parsed.success)
      .map((r) => `${String(r.id)}: ${JSON.stringify(r.parsed.error?.issues)}`);
    expect(failures).toEqual([]);
  });
});
