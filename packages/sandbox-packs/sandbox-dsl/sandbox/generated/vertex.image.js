// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function imageGeneration(inputs, options) {
  return createNode("vertex.image.ImageGeneration", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  imageGeneration
};
