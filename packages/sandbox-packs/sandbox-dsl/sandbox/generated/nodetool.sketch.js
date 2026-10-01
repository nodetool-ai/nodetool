// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderSketch(inputs, options) {
  return createNode("nodetool.sketch.RenderSketch", inputs, { id: options?.id, outputNames: ["image", "mask"], outputTypes: { "image": "image", "mask": "image" } });
}
function sketchLayers(inputs, options) {
  return createNode("nodetool.sketch.SketchLayers", inputs, { id: options?.id, outputNames: ["layers", "names"], outputTypes: { "layers": "list[image]", "names": "list[str]" } });
}
function createSketch(inputs, options) {
  return createNode("nodetool.sketch.CreateSketch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "sketch" }, defaultOutput: "output" });
}
export {
  createSketch,
  renderSketch,
  sketchLayers
};
