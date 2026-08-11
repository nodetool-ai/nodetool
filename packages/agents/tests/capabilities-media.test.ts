/**
 * The `media` and `style` capability modules: registry hygiene, classification
 * parity with the map the gate reads today, identity parity with the
 * deprecated tool classes, and one behavioral round trip per module through
 * the adapter.
 *
 * Generation and judging both go through
 * `ProcessingContext.runProviderPrediction`, which is stubbed here — no
 * provider, network, or database. The style pair runs against a stubbed
 * long-term memory carried on the run.
 */

import { describe, expect, it, vi } from "vitest";
import type { Message } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  MEDIA_CAPABILITIES,
  animateImage,
  compareImages,
  critiqueImage,
  editImage,
  embedText,
  generateImage,
  generateSpeech,
  generateVideo,
  scoreImageAdherence,
  transcribeAudio
} from "../src/capabilities/media.js";
import {
  STYLE_CAPABILITIES,
  getStyleProfile,
  recordStylePreference
} from "../src/capabilities/style.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import type { LongTermMemory } from "../src/long-term-memory.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";
import {
  AnimateImageTool,
  EditImageTool,
  EmbedTextTool,
  GenerateImageTool,
  GenerateSpeechTool,
  GenerateVideoTool,
  TranscribeAudioTool
} from "../src/tools/media-tools.js";
import {
  CompareImagesTool,
  CritiqueImageTool,
  GetStyleProfileTool,
  RecordStylePreferenceTool,
  ScoreImageAdherenceTool
} from "../src/tools/creative-critique-tools.js";

function makeContext(
  runProviderPrediction?: ReturnType<typeof vi.fn>
): ProcessingContext {
  return {
    userId: "user-1",
    runProviderPrediction
  } as unknown as ProcessingContext;
}

function reply(json: unknown): Message {
  return { role: "assistant", content: JSON.stringify(json) };
}

function asTool(entry: CapabilityExport, memory?: LongTermMemory): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate: UNGATED, memory })
  );
}

describe("media and style capability modules", () => {
  it("register without drift", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const media = await loadCapabilityModule("media");
    expect(media.exports.map((e) => e.spec.name)).toEqual([
      "generate_image",
      "edit_image",
      "generate_video",
      "animate_image",
      "generate_speech",
      "transcribe_audio",
      "embed_text",
      "critique_image",
      "compare_images",
      "score_image_adherence"
    ]);
    const style = await loadCapabilityModule("style");
    expect(style.exports.map((e) => e.spec.name)).toEqual([
      "record_style_preference",
      "get_style_profile"
    ]);
  });

  it("class every export the way the permission map does", () => {
    for (const entry of [...MEDIA_CAPABILITIES, ...STYLE_CAPABILITIES]) {
      expect(entry.spec.category).toBe(permissionCategoryFor(entry.spec.name));
    }
  });
});

describe("wire identity against the deprecated classes", () => {
  const pairs: [CapabilityExport, Tool][] = [
    [generateImage, new GenerateImageTool()],
    [editImage, new EditImageTool()],
    [generateVideo, new GenerateVideoTool()],
    [animateImage, new AnimateImageTool()],
    [generateSpeech, new GenerateSpeechTool()],
    [transcribeAudio, new TranscribeAudioTool()],
    [embedText, new EmbedTextTool()],
    [critiqueImage, new CritiqueImageTool()],
    [compareImages, new CompareImagesTool()],
    [scoreImageAdherence, new ScoreImageAdherenceTool()],
    [recordStylePreference, new RecordStylePreferenceTool()],
    [getStyleProfile, new GetStyleProfileTool()]
  ];

  it.each(
    pairs.map(([entry, tool]): [string, CapabilityExport, Tool] => [
      entry.spec.name,
      entry,
      tool
    ])
  )("%s keeps its name, description and schema", (name, entry, tool) => {
    expect(tool.name).toBe(name);
    expect(tool.description).toBe(entry.spec.description);
    expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
  });
});

describe("generate_image through the adapter", () => {
  it("dispatches text_to_image and writes the workspace copy", async () => {
    const write = vi.fn(async () => {});
    const context = {
      userId: "user-1",
      runProviderPrediction: vi.fn(async () => new Uint8Array([1, 2, 3])),
      workspaceStorage: {
        uriForKey: (key: string) => `ws://${key}`,
        store: write
      }
    } as unknown as ProcessingContext;

    const result = (await asTool(generateImage).process(context, {
      provider: "openai",
      model: "gpt-image-1",
      prompt: "a red fox",
      output_file: "fox.png"
    })) as Record<string, unknown>;

    expect(result["type"]).toBe("image");
    expect(result["provider"]).toBe("openai");
    const call = (
      context.runProviderPrediction as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as Record<string, unknown>;
    expect(call["capability"]).toBe("text_to_image");
    expect(call["model"]).toBe("gpt-image-1");
  });

  it("rejects a missing model before calling the provider", async () => {
    const predict = vi.fn();
    const result = await asTool(generateImage).process(makeContext(predict), {
      provider: "openai",
      prompt: "a red fox"
    });
    expect(result).toEqual({
      error: "model must be a non-empty string (use find_model)"
    });
    expect(predict).not.toHaveBeenCalled();
  });
});

describe("critique_image through the adapter", () => {
  it("returns the judge's parsed verdict", async () => {
    const predict = vi.fn(async () =>
      reply({
        verdict: "revise",
        defects: [
          { defect: "six fingers", location: "left hand", fix: "regenerate" }
        ],
        strengths: ["good light"]
      })
    );
    const result = (await asTool(critiqueImage).process(makeContext(predict), {
      provider: "openai",
      model: "gpt-5",
      image: "asset-1",
      brief: "a portrait"
    })) as Record<string, unknown>;

    expect(result["type"]).toBe("critique");
    expect(result["verdict"]).toBe("revise");
    expect(predict).toHaveBeenCalledTimes(1);
  });

  it("reports unparseable judge output as an error", async () => {
    const predict = vi.fn(async () => ({
      role: "assistant",
      content: "looks fine to me"
    }));
    const result = (await asTool(critiqueImage).process(makeContext(predict), {
      provider: "openai",
      model: "gpt-5",
      image: "asset-1",
      brief: "a portrait"
    })) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/did not return parseable JSON/);
  });
});

describe("style capabilities through the adapter", () => {
  function makeMemory(over: Partial<LongTermMemory>): LongTermMemory {
    return {
      remember: vi.fn(async () => null),
      recall: vi.fn(async () => []),
      ...over
    } as unknown as LongTermMemory;
  }

  it("records a preference against the run's memory", async () => {
    const remember = vi.fn(async () => ({ id: "mem-1" }));
    const memory = makeMemory({ remember: remember as never });
    const result = (await asTool(recordStylePreference, memory).process(
      makeContext(),
      { takeaway: "Muted palettes", chosen: "A", rejected: "B" }
    )) as Record<string, unknown>;

    expect(result).toEqual({
      stored: true,
      id: "mem-1",
      text: "Muted palettes (chose: A; over: B)"
    });
    expect(remember).toHaveBeenCalledWith(
      "Muted palettes (chose: A; over: B)",
      { kind: "preference", importance: 0.6, source: "style_preference" }
    );
  });

  it("renders recalled preferences as a profile block", async () => {
    const recall = vi.fn(async () => [
      { id: "m1", text: "Muted palettes", importance: 0.7, kind: "preference" },
      { id: "m2", text: "Unrelated fact", importance: 0.4, kind: "fact" }
    ]);
    const memory = makeMemory({ recall: recall as never });
    const result = (await asTool(getStyleProfile, memory).process(
      makeContext(),
      { k: 5 }
    )) as Record<string, unknown>;

    expect(result["profile"]).toBe("- Muted palettes");
    expect(result["items"]).toEqual([
      { id: "m1", text: "Muted palettes", importance: 0.7 }
    ]);
    expect(recall).toHaveBeenCalledWith(
      "visual style aesthetic preference taste",
      { k: 5 }
    );
  });
});
