// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function imageToText(inputs) {
  return createNode("mistral.vision.ImageToText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function ocr(inputs) {
  return createNode("mistral.vision.OCR", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  imageToText,
  ocr
};
