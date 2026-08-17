// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function extractText(inputs) {
  return callNode("lib.pdf.ExtractText", inputs);
}
function extractMarkdown(inputs) {
  return callNode("lib.pdf.ExtractMarkdown", inputs);
}
function extractTables(inputs) {
  return callNode("lib.pdf.ExtractTables", inputs);
}
function extractStyledText(inputs) {
  return callNode("lib.pdf.ExtractStyledText", inputs);
}
function screenshot(inputs) {
  return callNode("lib.pdf.Screenshot", inputs);
}
function pdftoppm(inputs) {
  return callNode("lib.pdf.Pdftoppm", inputs);
}
function extractOcr(inputs) {
  return callNode("lib.pdf.ExtractOcr", inputs);
}
export {
  extractMarkdown,
  extractOcr,
  extractStyledText,
  extractTables,
  extractText,
  pdftoppm,
  screenshot
};
