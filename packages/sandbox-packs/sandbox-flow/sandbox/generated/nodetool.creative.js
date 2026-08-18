// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function director(inputs) {
  return callNode("nodetool.creative.Director", inputs);
}
function screenplayShots(inputs) {
  return callNode("nodetool.creative.ScreenplayShots", inputs);
}
screenplayShots.stream = function(inputs) {
  return streamNode("nodetool.creative.ScreenplayShots", inputs);
};
function applyEntities(inputs) {
  return callNode("nodetool.creative.ApplyEntities", inputs);
}
function shotBatch(inputs) {
  return callNode("nodetool.creative.ShotBatch", inputs);
}
function shotChain(inputs) {
  return callNode("nodetool.creative.ShotChain", inputs);
}
export {
  applyEntities,
  director,
  screenplayShots,
  shotBatch,
  shotChain
};
