import { expect, it } from "vitest";
import {
  createCatalog,
  compileMediaPresets,
  mediaPresetSettings
} from "../src/index.js";
const catalog = createCatalog([
  {
    id: "camera.test",
    version: 1,
    kind: "camera",
    name: "Test",
    description: "Test",
    modes: ["video"],
    prompt: { default: "camera move", kling: "Kling move" },
    params: { duration_seconds: 4, unsupported: true }
  }
]);
it("shares managed model delegation, validation and mode parameter filtering", () => {
  const result = compileMediaPresets(
    ["camera.test"],
    "fal",
    "fal-ai/kling-video/v3/pro/text-to-video",
    "video",
    "Subject",
    catalog
  );
  expect(result.prompt).toContain("Kling move");
  expect(mediaPresetSettings(result, "video")).toEqual({ duration_seconds: 4 });
  expect(() =>
    compileMediaPresets(["missing"], "fal", "kling-v3", "video", "", catalog)
  ).toThrow("Unknown preset");
  expect(() =>
    compileMediaPresets(
      Array(4).fill("camera.test"),
      "fal",
      "kling-v3",
      "video",
      "",
      catalog
    )
  ).toThrow();
  expect(() =>
    compileMediaPresets(
      ["camera.test"],
      "fal",
      "kling-v3",
      "audio",
      "",
      catalog
    )
  ).toThrow("Presets do not support mode");
  expect(
    compileMediaPresets(
      undefined,
      "fal",
      "kling-v3",
      "audio",
      "unchanged",
      catalog
    ).prompt
  ).toBe("unchanged");
});

it("compiles video restyles at the shared RPC and chat media boundary", () => {
  const restyles = createCatalog([{
    id: "effect.restyle-test", version: 1, kind: "effect", name: "Restyle",
    description: "Restyle video", modes: ["video_edit"], inputs: ["video"],
    prompt: { default: "Use watercolor." }
  }]);
  const result = compileMediaPresets(
    ["effect.restyle-test"], "fake", "fake-video", "video_edit", "A dancer", restyles
  );
  expect(result.prompt).toBe("A dancer Use watercolor.");
  expect(result.applied).toEqual(["effect.restyle-test"]);
});
