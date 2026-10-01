// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function extractText(inputs, options) {
  return createNode("lib.pdf.ExtractText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function extractMarkdown(inputs, options) {
  return createNode("lib.pdf.ExtractMarkdown", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function extractTables(inputs, options) {
  return createNode("lib.pdf.ExtractTables", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[dict]" }, defaultOutput: "output" });
}
function extractStyledText(inputs, options) {
  return createNode("lib.pdf.ExtractStyledText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[dict]" }, defaultOutput: "output" });
}
function screenshot(inputs, options) {
  return createNode("lib.pdf.Screenshot", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function pdftoppm(inputs, options) {
  return createNode("lib.pdf.Pdftoppm", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function extractOcr(inputs, options) {
  return createNode("lib.pdf.ExtractOcr", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
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
