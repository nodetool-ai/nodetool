import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createCatalog, compilePresets, MODEL_FAMILIES } from "../src/index.js";
describe("preset compilation selfcheck", () => {
  it("compiles every preset in every mode for every family with a nonempty prompt", () => {
    const catalog = createCatalog(
      JSON.parse(
        readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8")
      )
    );
    expect(catalog.presets.length).toBeGreaterThan(0);
    const restyles = catalog.filter({ mode: "video_edit" });
    expect(restyles.length).toBeGreaterThanOrEqual(8);
    for (const restyle of restyles) {
      expect(restyle.kind).toBe("effect");
      expect(restyle.inputs).toEqual(["video"]);
    }
    const models = [
      "kling-v3",
      "seedance-2",
      "veo-3",
      "wan-2.6",
      "sora-2",
      "minimax/h3",
      "ltx-2",
      "local-wan/model",
      "default"
    ];
    expect(models).toHaveLength(MODEL_FAMILIES.length);
    for (const preset of catalog.presets) {
      for (const mode of preset.modes) {
        for (const modelId of models) {
          expect(
            compilePresets([preset.id], {
              catalog,
              mode,
              modelId,
              prompt: ""
            }).prompt.trim(),
            `${preset.id} ${modelId}`
          ).not.toBe("");
        }
      }
    }
  });
});

it("compiles every camera and effect using its distinct local Wan fragment", () => {
  const catalog = createCatalog(JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8")));
  const presets = catalog.presets.filter((preset) => preset.kind === "camera" || preset.kind === "effect");
  expect(presets).toHaveLength(68);
  expect(presets.filter((preset) => preset.id.startsWith("effect.restyle-"))).toHaveLength(8);
  for (const preset of presets) {
    const fragment = preset.prompt["local-wan"];
    expect(typeof fragment, preset.id).toBe("string");
    expect(fragment, preset.id).not.toBe(preset.prompt.wan);
    expect(preset.families ?? [], preset.id).not.toContain("local-wan");
    for (const mode of preset.modes) {
      const result = compilePresets([preset.id], { catalog, mode, modelId: "ti2v_2_2_fastwan", prompt: "" });
      expect(result.prompt, preset.id).toBe(fragment);
      expect(result.warnings.filter((warning) => warning.includes("using default")), preset.id).toEqual([]);
    }
  }
});
