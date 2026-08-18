// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function renderSketch(inputs) {
  return callNode("nodetool.sketch.RenderSketch", inputs);
}
function sketchLayers(inputs) {
  return callNode("nodetool.sketch.SketchLayers", inputs);
}
function createSketch(inputs) {
  return callNode("nodetool.sketch.CreateSketch", inputs);
}
export {
  createSketch,
  renderSketch,
  sketchLayers
};
