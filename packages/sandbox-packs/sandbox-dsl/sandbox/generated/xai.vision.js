// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function imageToText(inputs) {
  return createNode("xai.vision.ImageToText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  imageToText
};
