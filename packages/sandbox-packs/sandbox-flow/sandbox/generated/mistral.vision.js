// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function imageToText(inputs) {
  return callNode("mistral.vision.ImageToText", inputs);
}
function ocr(inputs) {
  return callNode("mistral.vision.OCR", inputs);
}
export {
  imageToText,
  ocr
};
