import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCatalog, compilePresets, modelFamily } from "@nodetool-ai/presets";

const catalog = loadCatalog(() => JSON.parse(readFileSync(
  new URL(import.meta.resolve("@nodetool-ai/presets/preset-catalog.json")), "utf8"
)));
assert.ok(catalog.presets.length > 0);
const preset = catalog.presets[0];
assert.deepEqual(compilePresets([preset.id], {
  catalog, modelId: "dreamina_seedance_45_pro", mode: "video", prompt: "A subject"
}).applied, [preset.id]);
assert.equal(modelFamily("dreamina_seedance_45_pro"), "seedance");
assert.ok(JSON.parse(readFileSync(new URL(import.meta.resolve("@nodetool-ai/presets/preset.schema.json")), "utf8")).properties);
