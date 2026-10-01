// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function imageToText(inputs, options) {
  return createNode("mistral.vision.ImageToText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function ocr(inputs, options) {
  return createNode("mistral.vision.OCR", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
export {
  imageToText,
  ocr
};
