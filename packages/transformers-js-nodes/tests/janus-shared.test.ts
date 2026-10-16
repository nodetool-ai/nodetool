import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setTransformersModuleForTesting } from "../src/transformers-base.js";
import {
  clearJanusCache,
  generateJanusImage,
  getJanus
} from "../src/janus-shared.js";
import { downloadTransformersJsModel } from "../src/tjs-downloader.js";

const REPO = "onnx-community/Janus-Pro-1B-ONNX";
const IMAGE = { data: new Uint8Array(3), width: 1, height: 1, channels: 3 };

class FakeStopper {
  interrupted = false;
  interrupt(): void {
    this.interrupted = true;
  }
}

let modelOptions: Record<string, unknown> | undefined;
let generateOptions: Record<string, unknown> | undefined;
let pipelineCalls = 0;
/** Lets a test hold `generate_images()` open until it has aborted. */
let generateGate: Promise<void> = Promise.resolve();

beforeEach(() => {
  modelOptions = undefined;
  generateOptions = undefined;
  pipelineCalls = 0;
  generateGate = Promise.resolve();
  const processor = Object.assign(
    async (conversation: unknown, options: unknown) => ({
      conversation,
      options
    }),
    { num_image_tokens: 576 }
  );
  const fake = {
    pipeline: async () => {
      pipelineCalls += 1;
      return () => null;
    },
    InterruptableStoppingCriteria: FakeStopper,
    AutoProcessor: { from_pretrained: async () => processor },
    MultiModalityCausalLM: {
      from_pretrained: async (_repo: string, options: Record<string, unknown>) => {
        modelOptions = options;
        return {
          generate_images: async (options: Record<string, unknown>) => {
            generateOptions = options;
            await generateGate;
            const stopper = options.stopping_criteria as FakeStopper | undefined;
            if (stopper?.interrupted) {
              throw new Error("image_decode: bad token grid");
            }
            return [IMAGE];
          },
          dispose: async () => undefined
        };
      }
    }
  };
  __setTransformersModuleForTesting(fake as never);
});

afterEach(() => {
  clearJanusCache();
  __setTransformersModuleForTesting(null);
});

describe("Janus", () => {
  it("keeps the image heads at full precision", async () => {
    await getJanus(REPO, undefined, undefined);
    expect(modelOptions?.dtype).toEqual({
      prepare_inputs_embeds: "q4",
      language_model: "q4",
      lm_head: "q4",
      gen_head: "fp32",
      gen_img_embeds: "fp32",
      image_decode: "fp32"
    });
  });

  it("samples exactly one image's worth of tokens", async () => {
    const janus = await getJanus(REPO, undefined, undefined);
    const image = await generateJanusImage(janus, "a fox");
    expect(image).toBe(IMAGE);
    expect(generateOptions).toMatchObject({
      conversation: [{ role: "<|User|>", content: "a fox" }],
      options: { chat_template: "text_to_image" },
      min_new_tokens: 576,
      max_new_tokens: 576,
      do_sample: true
    });
  });

  it("reports an abort, not the decoder failure it causes", async () => {
    const janus = await getJanus(REPO, undefined, undefined);
    const controller = new AbortController();
    let release: (() => void) | undefined;
    generateGate = new Promise((resolve) => {
      release = resolve;
    });

    const run = generateJanusImage(janus, "a fox", controller.signal);
    await vi.waitFor(() => expect(generateOptions).toBeDefined());
    controller.abort();
    release?.();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    const stopper = generateOptions?.stopping_criteria as FakeStopper;
    expect(stopper.interrupted).toBe(true);
  });
});

describe("a Janus download", () => {
  it("loads through the Janus loader, not a pipeline", async () => {
    await downloadTransformersJsModel(REPO, { modelType: "tjs.text_to_image" });
    expect(modelOptions).toBeDefined();
    expect(pipelineCalls).toBe(0);
  });
});
