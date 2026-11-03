import { describe, expect, it } from "vitest";
import { createCatalog, compilePresets, type PresetMode } from "@nodetool-ai/presets";
import {
  compileMediaPresets,
  mediaPresetSettings
} from "../src/session/media-generation.js";

describe("media preset boundary", () => {
  it("uses the resolved managed-provider model family", () => {
    expect(
      compileMediaPresets(
        ["camera.dolly-in"],
        "nodetool",
        "nodetool/kling-turbo",
        "video",
        "subject"
      ).warnings
    ).toEqual([]);
    expect(
      compileMediaPresets(
        ["camera.dolly-in"],
        "fake",
        "unrecognized",
        "video",
        "subject"
      ).warnings
    ).toHaveLength(1);
    expect(
      compileMediaPresets(
        ["camera.dolly-in"],
        "fake",
        "dreamina_seedance_45_pro",
        "video",
        "subject"
      ).warnings
    ).toEqual([]);
  });

  it("keeps only fields the requested mode accepts", () => {
    const catalog = createCatalog([
      {
        id: "look.test",
        version: 1,
        kind: "look",
        name: "Test",
        description: "Test settings",
        modes: ["image", "video", "image_edit"],
        prompt: { default: "camera clause" },
        params: {
          width: 640,
          height: 480,
          duration_seconds: 5,
          strength: 0.5,
          resolution: "720p",
          unknown: true
        }
      }
    ]);
    const compileFor = (mode: PresetMode) => compilePresets(["look.test"], {
      catalog,
      mode,
      modelId: "default",
      prompt: "subject"
    });
    expect(mediaPresetSettings(compileFor("video"), "video")).toEqual({
      duration_seconds: 5,
      resolution: "720p"
    });
    expect(mediaPresetSettings(compileFor("image"), "image")).toEqual({
      width: 640,
      height: 480,
      resolution: "720p"
    });
    expect(mediaPresetSettings(compileFor("image_edit"), "image_edit")).toEqual({
      width: 640,
      height: 480,
      strength: 0.5,
      resolution: "720p"
    });
  });
});
