// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function generateImage(inputs) {
  return callNode("nodetool.fake.GenerateImage", inputs);
}
function colorGrade(inputs) {
  return callNode("nodetool.fake.ColorGrade", inputs);
}
export {
  colorGrade,
  generateImage
};
