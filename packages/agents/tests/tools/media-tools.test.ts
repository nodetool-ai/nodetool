/**
 * Tests for the generic media-generation tools (image/video/audio/embed).
 *
 * These tools wrap `ProcessingContext.runProviderPrediction`/
 * `streamProviderPrediction` so the multi-task agent can generate media
 * inline without going through the GraphPlanner. The tests stub those
 * context methods and verify each tool dispatches the right capability,
 * writes binary results to the workspace, and surfaces clear errors when
 * required arguments are missing.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  AnimateImageTool,
  EditImageTool,
  EmbedTextTool,
  GenerateImageTool,
  GenerateSpeechTool,
  GenerateVideoTool,
  TranscribeAudioTool
} from "../../src/tools/media-tools.js";

let workspaceDir: string;
function createTmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "media-tools-test-"));
}

interface PredictCall {
  capability: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
}

function makeContext(stub: {
  run?: (req: PredictCall) => unknown;
  stream?: (req: PredictCall) => AsyncGenerator<unknown>;
}): ProcessingContext {
  return {
    workspaceDir,
    runProviderPrediction: vi.fn(async (req: PredictCall) => {
      if (!stub.run) throw new Error("runProviderPrediction not stubbed");
      return stub.run(req);
    }),
    streamProviderPrediction: vi.fn((req: PredictCall) => {
      if (!stub.stream) throw new Error("streamProviderPrediction not stubbed");
      return stub.stream(req);
    })
  } as unknown as ProcessingContext;
}

beforeEach(() => {
  workspaceDir = createTmpWorkspace();
});

afterEach(() => {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

describe("GenerateImageTool", () => {
  it("dispatches text_to_image and writes the bytes to workspace", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      run: (req) => {
        captured = req;
        return bytes;
      }
    });
    const tool = new GenerateImageTool();
    const result = (await tool.process(ctx, {
      provider: "openai",
      model: "gpt-image-1",
      prompt: "a cat",
      output_file: "out/cat.png",
      width: 512,
      height: 512
    })) as Record<string, unknown>;

    expect(captured).not.toBeNull();
    expect(captured!.capability).toBe("text_to_image");
    expect(captured!.params.prompt).toBe("a cat");
    expect(captured!.params.width).toBe(512);

    expect(result.type).toBe("image");
    expect(result.bytes).toBe(5);
    const written = fs.readFileSync(result.path as string);
    expect(Array.from(written)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns error when required args are missing", async () => {
    const ctx = makeContext({});
    const tool = new GenerateImageTool();
    const r = (await tool.process(ctx, {
      provider: "openai",
      model: "gpt-image-1"
    })) as { error: string };
    expect(r.error).toMatch(/prompt/);
  });

  it("returns error when provider/model missing", async () => {
    const ctx = makeContext({});
    const tool = new GenerateImageTool();
    const r = (await tool.process(ctx, {
      prompt: "a cat",
      output_file: "out/x.png"
    })) as { error: string };
    expect(r.error).toMatch(/provider/);
  });
});

describe("EditImageTool", () => {
  it("reads source image, dispatches image_to_image, writes result", async () => {
    const sourcePath = path.join(workspaceDir, "src.png");
    fs.writeFileSync(sourcePath, Buffer.from([10, 20, 30]));
    const out = new Uint8Array([99, 88, 77]);
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      run: (req) => {
        captured = req;
        return out;
      }
    });

    const tool = new EditImageTool();
    const result = (await tool.process(ctx, {
      provider: "openai",
      model: "gpt-image-1",
      input_file: "src.png",
      prompt: "make it red",
      output_file: "edited.png"
    })) as Record<string, unknown>;

    expect(captured!.capability).toBe("image_to_image");
    const passedImage = captured!.params.image as Uint8Array;
    expect(Array.from(passedImage)).toEqual([10, 20, 30]);
    expect(result.type).toBe("image");
    const written = fs.readFileSync(result.path as string);
    expect(Array.from(written)).toEqual([99, 88, 77]);
  });
});

describe("GenerateVideoTool / AnimateImageTool", () => {
  it("dispatches text_to_video", async () => {
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      run: (req) => {
        captured = req;
        return new Uint8Array([1]);
      }
    });
    const tool = new GenerateVideoTool();
    await tool.process(ctx, {
      provider: "fal_ai",
      model: "runway",
      prompt: "a cat skiing",
      output_file: "v.mp4"
    });
    expect(captured!.capability).toBe("text_to_video");
    expect(captured!.params.prompt).toBe("a cat skiing");
  });

  it("dispatches image_to_video with source image bytes", async () => {
    const sourcePath = path.join(workspaceDir, "frame.png");
    fs.writeFileSync(sourcePath, Buffer.from([7]));
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      run: (req) => {
        captured = req;
        return new Uint8Array([2]);
      }
    });
    const tool = new AnimateImageTool();
    await tool.process(ctx, {
      provider: "fal_ai",
      model: "runway",
      input_file: "frame.png",
      output_file: "v.mp4"
    });
    expect(captured!.capability).toBe("image_to_video");
    const passedImage = captured!.params.image as Uint8Array;
    expect(Array.from(passedImage)).toEqual([7]);
  });
});

describe("GenerateSpeechTool", () => {
  it("concatenates streamed bytes and writes to workspace", async () => {
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      stream: (req) => {
        captured = req;
        return (async function* () {
          yield { data: new Uint8Array([1, 2]), mimeType: "audio/mp3" };
          yield { data: new Uint8Array([3, 4, 5]), mimeType: "audio/mp3" };
        })();
      }
    });
    const tool = new GenerateSpeechTool();
    const result = (await tool.process(ctx, {
      provider: "openai",
      model: "tts-1",
      text: "hello",
      voice: "alloy",
      output_file: "out/hello.mp3"
    })) as Record<string, unknown>;
    expect(captured!.capability).toBe("text_to_speech");
    expect(result.type).toBe("audio");
    expect(result.mime_type).toBe("audio/mp3");
    expect(result.bytes).toBe(5);
    const written = fs.readFileSync(result.path as string);
    expect(Array.from(written)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns error when stream yields nothing", async () => {
    const ctx = makeContext({
      stream: () => (async function* () {})() as AsyncGenerator<unknown>
    });
    const tool = new GenerateSpeechTool();
    const r = (await tool.process(ctx, {
      provider: "openai",
      model: "tts-1",
      text: "hi",
      output_file: "x.mp3"
    })) as { error: string };
    expect(r.error).toMatch(/no audio/i);
  });
});

describe("TranscribeAudioTool", () => {
  it("dispatches automatic_speech_recognition and returns text", async () => {
    fs.writeFileSync(path.join(workspaceDir, "in.wav"), Buffer.from([42]));
    const ctx = makeContext({
      run: () => ({ text: "hello world" })
    });
    const tool = new TranscribeAudioTool();
    const r = (await tool.process(ctx, {
      provider: "openai",
      model: "whisper-1",
      input_file: "in.wav"
    })) as Record<string, unknown>;
    expect(r.type).toBe("transcription");
    expect(r.text).toBe("hello world");
    expect(r.full_length).toBe(11);
  });

  it("truncates very long transcripts in the result preview", async () => {
    fs.writeFileSync(path.join(workspaceDir, "in.wav"), Buffer.from([42]));
    const longText = "a".repeat(2000);
    const ctx = makeContext({ run: () => ({ text: longText }) });
    const r = (await new TranscribeAudioTool().process(ctx, {
      provider: "openai",
      model: "whisper-1",
      input_file: "in.wav"
    })) as Record<string, unknown>;
    expect((r.text as string).length).toBeLessThan(longText.length);
    expect(r.full_length).toBe(2000);
  });
});

describe("EmbedTextTool", () => {
  it("dispatches generate_embedding and returns vectors", async () => {
    let captured: PredictCall | null = null;
    const ctx = makeContext({
      run: (req) => {
        captured = req;
        return [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6]
        ];
      }
    });
    const tool = new EmbedTextTool();
    const r = (await tool.process(ctx, {
      provider: "openai",
      model: "text-embedding-3-small",
      text: ["hello", "world"]
    })) as Record<string, unknown>;
    expect(captured!.capability).toBe("generate_embedding");
    expect(r.type).toBe("embedding");
    expect(r.count).toBe(2);
    expect(r.dimensions).toBe(3);
  });

  it("rejects non-string/array text", async () => {
    const ctx = makeContext({});
    const tool = new EmbedTextTool();
    const r = (await tool.process(ctx, {
      provider: "openai",
      model: "text-embedding-3-small",
      text: 42
    })) as { error: string };
    expect(r.error).toMatch(/text must be/);
  });
});
