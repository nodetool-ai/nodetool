import { describe, expect, it } from "vitest";
import {
  IMAGE_EDIT_TASK,
  imageModelSupportsTask,
  imageModelTasks,
  isImageEditModel
} from "../src/image-model-tasks.js";
import type { ProcessingContext } from "../src/context.js";

const contextWith = (getProvider: () => Promise<unknown>) =>
  ({ getProvider }) as unknown as ProcessingContext;

const catalog = contextWith(async () => ({
  getAvailableImageModels: async () => [
    { id: "edit", provider: "p", supportedTasks: ["text_to_image", "image_to_image"] },
    { id: "plain", provider: "p", supportedTasks: ["text_to_image"] }
  ]
}));

describe("imageModelSupportsTask", () => {
  it("answers from the declared tasks without a catalog lookup", async () => {
    const unreachable = contextWith(async () => {
      throw new Error("no lookup expected");
    });
    const model = { provider: "p", model: "x" };
    expect(await imageModelSupportsTask(unreachable, model, "image_to_image", ["image_to_image"])).toBe(true);
    expect(await imageModelSupportsTask(unreachable, model, "image_to_image", ["text_to_image"])).toBe(false);
  });

  it("falls back to the provider catalog", async () => {
    expect(await imageModelSupportsTask(catalog, { provider: "p", model: "edit" }, "image_to_image")).toBe(true);
    expect(await imageModelSupportsTask(catalog, { provider: "p", model: "plain" }, "image_to_image")).toBe(false);
    expect(await imageModelSupportsTask(catalog, { provider: "p", model: "gone" }, "image_to_image", [])).toBe(false);
  });

  it("answers false when the provider is unavailable", async () => {
    const missing = contextWith(async () => {
      throw new Error("no key");
    });
    expect(await imageModelSupportsTask(missing, { provider: "p", model: "edit" }, "image_to_image")).toBe(false);
  });
});

const i2i = (id: string, name = id, both = true) => ({
  id,
  name,
  supportedTasks: both ? ["text_to_image", "image_to_image"] : ["image_to_image"]
});

describe("isImageEditModel", () => {
  it("tags dedicated edit endpoints and instruction-editor families", () => {
    for (const model of [
      i2i("openai/gpt-image-2/edit", "GPT Image 2 — Edit", false),
      i2i("alibaba/wan-2.7/image-edit", "Wan 2.7 — Image Edit", false),
      i2i("qwen/qwen-image-edit-plus", "qwen-image-edit-plus", false),
      i2i("black-forest-labs/flux-kontext-dev", "FLUX.1 Kontext Dev", false),
      i2i("gpt-image-1", "GPT Image 1"),
      i2i("gemini-3-pro-image", "Gemini 3 Pro Image"),
      i2i("google/nano-banana-pro", "nano-banana-pro"),
      i2i("high_aes_general_v40l", "Seedream 4.5"),
      i2i("black-forest-labs/flux-2-pro", "flux-2-pro")
    ]) {
      expect(isImageEditModel(model), model.id).toBe(true);
    }
  });

  it("leaves generators with an optional start image and restorers out", () => {
    for (const model of [
      i2i("black-forest-labs/flux-dev", "flux-dev"),
      i2i("playgroundai/playground-v2.5-1024px-aesthetic", "playground"),
      i2i("wuzoobia/bruna-portrait", "bruna-portrait"),
      i2i("high_aes_general_v30l:general_v3.0_18b", "Seedream 3.0"),
      i2i("lucataco/codeformer", "codeformer", false),
      i2i("cjwbw/supir", "supir", false)
    ]) {
      expect(isImageEditModel(model), model.id).toBe(false);
    }
  });

  it("needs an image input, so a text-only edit name stays out", () => {
    expect(
      isImageEditModel({
        id: "x/edit",
        name: "Edit",
        supportedTasks: ["text_to_image"]
      })
    ).toBe(false);
  });

  it("adds the task once to the model's task list", () => {
    const tasks = imageModelTasks(i2i("gpt-image-1"));
    expect(tasks).toEqual(["text_to_image", "image_to_image", IMAGE_EDIT_TASK]);
    expect(
      imageModelTasks({ id: "a", name: "a", supportedTasks: tasks })
    ).toBe(tasks);
    expect(imageModelTasks(i2i("flux-dev"))).toEqual([
      "text_to_image",
      "image_to_image"
    ]);
  });

  it("answers image_edit from the provider catalog", async () => {
    const editors = contextWith(async () => ({
      getAvailableImageModels: async () => [i2i("gpt-image-1"), i2i("flux-dev")]
    }));
    expect(await imageModelSupportsTask(editors, { provider: "p", model: "gpt-image-1" }, IMAGE_EDIT_TASK)).toBe(true);
    expect(await imageModelSupportsTask(editors, { provider: "p", model: "flux-dev" }, IMAGE_EDIT_TASK)).toBe(false);
  });
});
