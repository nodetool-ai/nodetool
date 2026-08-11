// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function generateImage(inputs) {
  return createNode("nodetool.fake.GenerateImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function colorGrade(inputs) {
  return createNode("nodetool.fake.ColorGrade", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  colorGrade,
  generateImage
};
