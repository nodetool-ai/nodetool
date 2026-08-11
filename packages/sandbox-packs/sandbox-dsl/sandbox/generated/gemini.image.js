// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function imageGeneration(inputs) {
  return createNode("gemini.image.ImageGeneration", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  imageGeneration
};
