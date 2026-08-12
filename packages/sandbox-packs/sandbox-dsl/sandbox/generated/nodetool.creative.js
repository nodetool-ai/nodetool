// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function director(inputs) {
  return createNode("nodetool.creative.Director", inputs, { outputNames: ["screenplay", "narration", "music_prompt", "title"] });
}
function screenplayShots(inputs) {
  return createNode("nodetool.creative.ScreenplayShots", inputs, { outputNames: ["shot", "shot_prompt", "index", "output"], streaming: true });
}
function applyEntities(inputs) {
  return createNode("nodetool.creative.ApplyEntities", inputs, { outputNames: ["prompt", "reference_images"] });
}
function shotBatch(inputs) {
  return createNode("nodetool.creative.ShotBatch", inputs, { outputNames: ["shots"], defaultOutput: "shots" });
}
function shotChain(inputs) {
  return createNode("nodetool.creative.ShotChain", inputs, { outputNames: ["videos"], defaultOutput: "videos" });
}
export {
  applyEntities,
  director,
  screenplayShots,
  shotBatch,
  shotChain
};
