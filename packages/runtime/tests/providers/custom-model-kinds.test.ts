import { describe, it, expect } from "vitest";
import {
  classifyListedModel,
  kindFromModelId
} from "../../src/providers/custom-model-kinds.js";

describe("kindFromModelId", () => {
  it.each([
    ["dall-e-3", "image"],
    ["gpt-image-1", "image"],
    ["black-forest-labs/flux-1.1-pro", "image"],
    ["doubao-seedream-4-0", "image"],
    ["stable-diffusion-xl", "image"],
    ["imagen-4.0-generate", "image"],
    ["sora-2", "video"],
    ["veo-3.0-generate", "video"],
    ["kling-v2-master", "video"],
    ["doubao-seedance-1-0-pro", "video"],
    ["wan2.1-t2v-plus", "video"],
    ["minimax-hailuo-02", "video"],
    ["kling-image-to-video", "video"],
    ["gpt-4o-mini", "language"],
    ["claude-sonnet-4", "language"],
    ["qwen2.5-vl-72b", "language"],
    ["deepseek-chat", "language"],
    ["diaspora-7b", "language"],
    ["runway/gen4_turbo", "video"],
    ["alibaba/wan-2.2", "video"]
  ])("%s → %s", (id, kind) => {
    expect(kindFromModelId(id)).toBe(kind);
  });
});

describe("classifyListedModel", () => {
  it("trusts a vendor type field over the id", () => {
    expect(classifyListedModel({ id: "agnes-pro", type: "image" })).toEqual({
      kind: "image",
      source: "metadata"
    });
    expect(
      classifyListedModel({ id: "agnes-motion", model_type: "text-to-video" })
    ).toEqual({ kind: "video", source: "metadata" });
    expect(classifyListedModel({ id: "flux-chat", type: "chat" })).toEqual({
      kind: "language",
      source: "metadata"
    });
  });

  it("reads OpenRouter-style output modalities", () => {
    expect(
      classifyListedModel({
        id: "some/painter",
        architecture: { output_modalities: ["image"] }
      })
    ).toEqual({ kind: "image", source: "metadata" });
    expect(
      classifyListedModel({ id: "x", output_modalities: ["video"] })
    ).toEqual({ kind: "video", source: "metadata" });
  });

  it("keeps a chat model that can also draw on the chat route", () => {
    expect(
      classifyListedModel({
        id: "google/gemini-2.5-flash-image",
        architecture: { output_modalities: ["image", "text"] }
      })
    ).toEqual({ kind: "language", source: "metadata" });
  });

  it("falls back to the id, then to chat", () => {
    expect(classifyListedModel({ id: "flux-dev", type: "model" })).toEqual({
      kind: "image",
      source: "id"
    });
    expect(classifyListedModel({ id: "llama-3", object: "model" })).toEqual({
      kind: "language",
      source: "default"
    });
  });
});
