import { describe, expect, it } from "vitest";
import { imageModelSupportsTask } from "../src/image-model-tasks.js";
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
