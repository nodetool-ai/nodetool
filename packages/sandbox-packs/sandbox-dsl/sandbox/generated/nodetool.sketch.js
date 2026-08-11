// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderSketch(inputs) {
  return createNode("nodetool.sketch.RenderSketch", inputs, { outputNames: ["image", "mask"] });
}
function sketchLayers(inputs) {
  return createNode("nodetool.sketch.SketchLayers", inputs, { outputNames: ["layers", "names"] });
}
function createSketch(inputs) {
  return createNode("nodetool.sketch.CreateSketch", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  createSketch,
  renderSketch,
  sketchLayers
};
