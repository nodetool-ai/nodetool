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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Message, MessageContent } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
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
  transcribeAudio,
  understandVideo,
  ffmpeg,
  ytDlp
} from "../src/capabilities/media.js";
import {
  STYLE_CAPABILITIES,
  getStyleProfile,
  recordStylePreference
} from "../src/capabilities/style.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import type { LongTermMemory } from "../src/long-term-memory.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";

function makeContext(
  runProviderPrediction?: ReturnType<typeof vi.fn>
): ProcessingContext {
  return {
    userId: "user-1",
    runProviderPrediction
  } as unknown as ProcessingContext;
}

/** A context with a real workspace directory on disk. */
function workspaceContext(dir: string): ProcessingContext {
  return {
    userId: "user-1",
    workspace: createLocalWorkspace(dir),
    resolveWorkspacePath: (relative: string) => resolve(dir, relative)
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
      "read_media_bytes",
      "critique_image",
      "compare_images",
      "score_image_adherence",
      "understand_video",
      "ffmpeg",
      "ffprobe",
      "yt_dlp"
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

describe("wire identity: a Tool built from the spec", () => {
  const pairs: [CapabilityExport, Tool][] = [
    [generateImage, toolForCapabilityName("generate_image")],
    [editImage, toolForCapabilityName("edit_image")],
    [generateVideo, toolForCapabilityName("generate_video")],
    [animateImage, toolForCapabilityName("animate_image")],
    [generateSpeech, toolForCapabilityName("generate_speech")],
    [transcribeAudio, toolForCapabilityName("transcribe_audio")],
    [embedText, toolForCapabilityName("embed_text")],
    [critiqueImage, toolForCapabilityName("critique_image")],
    [compareImages, toolForCapabilityName("compare_images")],
    [scoreImageAdherence, toolForCapabilityName("score_image_adherence")],
    [understandVideo, toolForCapabilityName("understand_video")],
    [ffmpeg, toolForCapabilityName("ffmpeg")],
    [ytDlp, toolForCapabilityName("yt_dlp")],
    [recordStylePreference, toolForCapabilityName("record_style_preference")],
    [getStyleProfile, toolForCapabilityName("get_style_profile")]
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
      workspace: {
        localDir: null,
        write,
        read: async () => null,
        key: (p: string) => p
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

describe("understand_video through the adapter", () => {
  function partsOf(predict: ReturnType<typeof vi.fn>): MessageContent[] {
    const call = predict.mock.calls[0]?.[0] as {
      params: { messages: Message[]; max_tokens: number };
      provider: string;
      model: string;
      capability: string;
    };
    const content = call.params.messages[0].content;
    if (!Array.isArray(content)) throw new Error("expected content parts");
    return content;
  }

  it("sends the prompt and a video part, and returns the answer text", async () => {
    const predict = vi.fn(async () => ({
      role: "assistant",
      content: "A fox crosses a snowfield."
    }));
    const result = (await asTool(understandVideo).process(
      makeContext(predict),
      {
        provider: "gemini",
        model: "gemini-3-pro",
        video: "asset://clip-1.mp4",
        prompt: "What happens?"
      }
    )) as Record<string, unknown>;

    expect(result).toEqual({
      text: "A fox crosses a snowfield.",
      provider: "gemini",
      model: "gemini-3-pro"
    });
    expect(partsOf(predict)).toEqual([
      { type: "text", text: "What happens?" },
      { type: "video", video: { type: "video", uri: "asset://clip-1.mp4" } }
    ]);
  });

  it("normalizes a bare asset id and defaults the prompt", async () => {
    const predict = vi.fn(async () => ({
      role: "assistant",
      content: "ok"
    }));
    await asTool(understandVideo).process(makeContext(predict), {
      provider: "gemini",
      model: "gemini-3-pro",
      video: " clip-1 "
    });
    expect(partsOf(predict)).toEqual([
      { type: "text", text: "Describe this video in detail." },
      { type: "video", video: { type: "video", uri: "asset://clip-1" } }
    ]);
  });

  it("caps max_tokens and defaults it when absent", async () => {
    const maxTokensOf = async (params: Record<string, unknown>) => {
      const predict = vi.fn(async () => ({ role: "assistant", content: "ok" }));
      await asTool(understandVideo).process(makeContext(predict), {
        provider: "gemini",
        model: "gemini-3-pro",
        video: "clip-1",
        ...params
      });
      const call = predict.mock.calls[0][0] as {
        params: { max_tokens: number };
      };
      return call.params.max_tokens;
    };
    expect(await maxTokensOf({})).toBe(1500);
    expect(await maxTokensOf({ max_tokens: 400 })).toBe(400);
    expect(await maxTokensOf({ max_tokens: 100000 })).toBe(8192);
  });

  it("requires provider, model and video, pointing at find_model", async () => {
    const predict = vi.fn();
    const noModel = (await asTool(understandVideo).process(
      makeContext(predict),
      { provider: "gemini", video: "clip-1" }
    )) as Record<string, unknown>;
    expect(String(noModel["error"])).toMatch(/find_model/);

    const noProvider = (await asTool(understandVideo).process(
      makeContext(predict),
      { model: "gemini-3-pro", video: "clip-1" }
    )) as Record<string, unknown>;
    expect(String(noProvider["error"])).toMatch(/find_model/);

    const noVideo = (await asTool(understandVideo).process(
      makeContext(predict),
      { provider: "gemini", model: "gemini-3-pro" }
    )) as Record<string, unknown>;
    expect(noVideo).toEqual({ error: "video is required" });
    expect(predict).not.toHaveBeenCalled();
  });

  it("reports a provider failure as an error", async () => {
    const predict = vi.fn(async () => {
      throw new Error("no video support");
    });
    const result = (await asTool(understandVideo).process(
      makeContext(predict),
      { provider: "gemini", model: "gemini-3-pro", video: "clip-1" }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toBe(
      "understand_video failed: no video support"
    );
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

/**
 * A context whose workspace is the given real directory — what the host-binary
 * capabilities need, since they run a binary in it.
 */
function localWorkspaceContext(dir: string): ProcessingContext {
  return {
    workspace: createLocalWorkspace(dir)
  } as unknown as ProcessingContext;
}

describe("ffmpeg and yt_dlp capabilities", () => {
  it("ffmpeg rejects missing args before spawn", async () => {
    const result = (await asTool(ffmpeg).process(
      localWorkspaceContext("/tmp"),
      { args: [] }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/args must be/);
  });

  it("ffmpeg requires a workspace", async () => {
    const result = (await asTool(ffmpeg).process(makeContext(), {
      args: ["-version"]
    })) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/workspace is required/);
  });

  it("yt_dlp rejects a missing url", async () => {
    const result = (await asTool(ytDlp).process(
      localWorkspaceContext("/tmp"),
      {}
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/url is required/);
  });

  it("yt_dlp rejects a non-http url", async () => {
    const result = (await asTool(ytDlp).process(
      localWorkspaceContext("/tmp"),
      { url: "file:///etc/passwd" }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/unsupported scheme/);
  });

  // The guard is unit-tested in host-binary-guard.test.ts; these pin that the
  // capability actually calls it, and refuses before anything is spawned.
  it("ffmpeg refuses a path outside the workspace", async () => {
    const result = (await asTool(ffmpeg).process(
      localWorkspaceContext("/tmp"),
      { args: ["-i", "/etc/passwd", "out.wav"] }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/outside the workspace/);
  });

  it("ffmpeg refuses a network input", async () => {
    const result = (await asTool(ffmpeg).process(
      localWorkspaceContext("/tmp"),
      { args: ["-i", "http://169.254.169.254/latest/meta-data/", "out.txt"] }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/Only workspace files are readable/);
  });

  it("ffmpeg stages an inputs ref into the workspace before running", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ffmpeg-inputs-"));
    try {
      // ffmpeg may not be installed here; staging happens before the spawn,
      // so the file on disk is what this pins.
      await asTool(ffmpeg).process(workspaceContext(dir), {
        args: ["-i", "a.txt", "out.mp4"],
        inputs: { "a.txt": "data:text/plain;base64,aGk=" }
      });
      expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("hi");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ffmpeg refuses an inputs name that escapes the workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ffmpeg-inputs-"));
    try {
      const result = (await asTool(ffmpeg).process(workspaceContext(dir), {
        args: ["-i", "a.txt", "out.mp4"],
        inputs: { "../escaped.txt": "data:text/plain;base64,aGk=" }
      })) as Record<string, unknown>;
      expect(String(result["error"])).toMatch(/outside the workspace/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ffmpeg names the ref it could not read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ffmpeg-inputs-"));
    try {
      const result = (await asTool(ffmpeg).process(workspaceContext(dir), {
        args: ["-i", "a.mp4", "out.mp4"],
        inputs: { "a.mp4": "asset://does-not-exist.mp4" }
      })) as Record<string, unknown>;
      expect(String(result["error"])).toMatch(/could not read/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ffmpeg points a refused URI at the inputs parameter", async () => {
    const result = (await asTool(ffmpeg).process(
      localWorkspaceContext("/tmp"),
      { args: ["-i", "asset://abc.mp4", "out.mp4"] }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/`inputs`/);
  });

  it("ffmpeg refuses an output_file that escapes the workspace", async () => {
    const result = (await asTool(ffmpeg).process(
      localWorkspaceContext("/tmp"),
      { args: ["-i", "in.mp4"], output_file: "../../etc/cron.d/x" }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/outside the workspace/);
  });

  it.each([
    ["http://169.254.169.254/latest/meta-data/", /internal\/private address/],
    ["http://localhost:7777/api/workflows", /localhost/],
    ["http://10.0.0.5/internal.mp4", /internal\/private address/],
    ["http://[::ffff:127.0.0.1]/x.mp4", /internal\/private address/]
  ])("yt_dlp refuses %s", async (url, expected) => {
    const result = (await asTool(ytDlp).process(
      localWorkspaceContext("/tmp"),
      { url }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(expected);
  });

  it("yt_dlp refuses a format that would be read as an option", async () => {
    const result = (await asTool(ytDlp).process(
      localWorkspaceContext("/tmp"),
      { url: "https://example.com/v", format: "--exec" }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/cannot start with/);
  });

  it("yt_dlp refuses an output template that escapes the workspace", async () => {
    const result = (await asTool(ytDlp).process(
      localWorkspaceContext("/tmp"),
      {
        url: "https://example.com/v",
        output_file: "../../root/.ssh/authorized_keys"
      }
    )) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/outside the workspace/);
  });
});
