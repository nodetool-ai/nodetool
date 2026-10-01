// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function generateImage(inputs, options) {
  return createNode("nodetool.fake.GenerateImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function colorGrade(inputs, options) {
  return createNode("nodetool.fake.ColorGrade", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  colorGrade,
  generateImage
};
