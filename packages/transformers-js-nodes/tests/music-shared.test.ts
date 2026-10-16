import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { __setTransformersModuleForTesting } from "../src/transformers-base.js";
import {
  MUSICGEN_DEFAULT_SECONDS,
  clearMusicgenCache,
  generateMusic,
  getMusicgen,
  musicDuration,
  musicgenTokens
} from "../src/music-shared.js";
import { downloadTransformersJsModel } from "../src/tjs-downloader.js";
import { TextToMusicNode } from "../src/nodes/text-to-music.js";

const REPO = "Xenova/musicgen-small";

const CONFIG = {
  audio_encoder: { sampling_rate: 32000, frame_rate: 50 },
  decoder: { num_codebooks: 4 }
};

class FakeStopper {
  interrupted = false;
  interrupt(): void {
    this.interrupted = true;
  }
}

let modelOptions: Record<string, unknown> | undefined;
let generateOptions: Record<string, unknown> | undefined;
let pipelineCalls = 0;
/** Lets a test hold `generate()` open until it has aborted. */
let generateGate: Promise<void> = Promise.resolve();

beforeEach(() => {
  modelOptions = undefined;
  generateOptions = undefined;
  pipelineCalls = 0;
  generateGate = Promise.resolve();
  const fake = {
    pipeline: async () => {
      pipelineCalls += 1;
      return () => null;
    },
    InterruptableStoppingCriteria: FakeStopper,
    AutoTokenizer: {
      from_pretrained: async () => (text: string) => ({ input_ids: [text] })
    },
    MusicgenForConditionalGeneration: {
      from_pretrained: async (_repo: string, options: Record<string, unknown>) => {
        modelOptions = options;
        return {
          config: CONFIG,
          generate: async (options: Record<string, unknown>) => {
            generateOptions = options;
            await generateGate;
            return { data: new Float32Array([0.25, -0.25]) };
          },
          dispose: async () => undefined
        };
      }
    }
  };
  __setTransformersModuleForTesting(fake as never);
});

afterEach(() => {
  clearMusicgenCache();
  __setTransformersModuleForTesting(null);
});

describe("MusicGen length", () => {
  it("asks for one token per frame plus the codebook delay", () => {
    expect(musicgenTokens(10, CONFIG)).toBe(504);
  });

  it("clamps the duration to what MusicGen can make", () => {
    expect(musicDuration(90)).toBe(30);
    expect(musicDuration(0.2)).toBe(1);
    expect(musicDuration(undefined)).toBe(MUSICGEN_DEFAULT_SECONDS);
    expect(musicDuration(Number.NaN)).toBe(MUSICGEN_DEFAULT_SECONDS);
  });
});

describe("getMusicgen and generateMusic", () => {
  it("keeps the audio decoder at full precision", async () => {
    await getMusicgen(REPO, "q4", undefined);
    expect(modelOptions?.dtype).toEqual({
      text_encoder: "q4",
      decoder_model_merged: "q4",
      encodec_decode: "fp32"
    });
  });

  it("samples the prompt and returns the decoder's sample rate", async () => {
    const musicgen = await getMusicgen(REPO, undefined, undefined);
    const result = await generateMusic(musicgen, "lofi piano", {
      durationSeconds: 2
    });

    expect(result.sampling_rate).toBe(32000);
    expect(Array.from(result.audio)).toEqual([0.25, -0.25]);
    expect(generateOptions).toMatchObject({
      input_ids: ["lofi piano"],
      max_new_tokens: 104,
      do_sample: true,
      guidance_scale: 3
    });
  });

  it("interrupts the sampling loop on abort and throws AbortError", async () => {
    const musicgen = await getMusicgen(REPO, undefined, undefined);
    const controller = new AbortController();
    let release: (() => void) | undefined;
    generateGate = new Promise((resolve) => {
      release = resolve;
    });

    const run = generateMusic(musicgen, "drums", { signal: controller.signal });
    await vi.waitFor(() => expect(generateOptions).toBeDefined());
    controller.abort();
    release?.();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    const stopper = generateOptions?.stopping_criteria as FakeStopper;
    expect(stopper.interrupted).toBe(true);
  });
});

describe("a MusicGen download", () => {
  it("loads through the MusicGen loader, not a pipeline", async () => {
    await downloadTransformersJsModel(REPO, { modelType: "tjs.text_to_music" });
    expect(modelOptions).toBeDefined();
    expect(pipelineCalls).toBe(0);
  });
});

describe("TextToMusicNode", () => {
  it("returns WAV audio from the prompt", async () => {
    const node = new TextToMusicNode();
    node.assign({ prompt: "jazz trio", duration: 4 });
    const context = { signal: new AbortController().signal };

    const out = await node.process(context as unknown as ProcessingContext);

    expect(out.output.type).toBe("audio");
    expect(out.output.content_type).toBe("audio/wav");
    expect(Buffer.from(out.output.data, "base64").subarray(0, 4).toString()).toBe(
      "RIFF"
    );
    expect(generateOptions?.max_new_tokens).toBe(204);
  });

  it("requires a prompt", async () => {
    const node = new TextToMusicNode();
    node.assign({ prompt: "" });
    await expect(node.process()).rejects.toThrow("Prompt is required");
  });
});
