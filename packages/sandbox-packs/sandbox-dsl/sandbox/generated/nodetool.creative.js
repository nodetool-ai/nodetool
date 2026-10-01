// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function director(inputs, options) {
  return createNode("nodetool.creative.Director", inputs, { id: options?.id, outputNames: ["screenplay", "narration", "music_prompt", "title"], outputTypes: { "screenplay": "dict", "narration": "str", "music_prompt": "str", "title": "str" } });
}
function screenplayShots(inputs, options) {
  return createNode("nodetool.creative.ScreenplayShots", inputs, { id: options?.id, outputNames: ["shot", "shot_prompt", "index", "output"], outputTypes: { "shot": "dict", "shot_prompt": "str", "index": "int", "output": "list[str]" }, streaming: true, inputMode: "buffered", outputCorrelation: { "shot": { "kind": "iteration", "source": "__execution__", "group": "items" }, "shot_prompt": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" }, "output": { "kind": "single", "source": "__execution__" } } });
}
function applyEntities(inputs, options) {
  return createNode("nodetool.creative.ApplyEntities", inputs, { id: options?.id, outputNames: ["prompt", "reference_images"], outputTypes: { "prompt": "str", "reference_images": "list[image]" } });
}
function shotBatch(inputs, options) {
  return createNode("nodetool.creative.ShotBatch", inputs, { id: options?.id, outputNames: ["shots"], outputTypes: { "shots": "list[dict]" }, defaultOutput: "shots" });
}
function shotChain(inputs, options) {
  return createNode("nodetool.creative.ShotChain", inputs, { id: options?.id, outputNames: ["videos"], outputTypes: { "videos": "list[video]" }, defaultOutput: "videos" });
}
export {
  applyEntities,
  director,
  screenplayShots,
  shotBatch,
  shotChain
};
