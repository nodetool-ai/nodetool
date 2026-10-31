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
