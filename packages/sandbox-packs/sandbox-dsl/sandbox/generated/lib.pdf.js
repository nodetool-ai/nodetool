// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function extractText(inputs) {
  return createNode("lib.pdf.ExtractText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractMarkdown(inputs) {
  return createNode("lib.pdf.ExtractMarkdown", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractTables(inputs) {
  return createNode("lib.pdf.ExtractTables", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractStyledText(inputs) {
  return createNode("lib.pdf.ExtractStyledText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function screenshot(inputs) {
  return createNode("lib.pdf.Screenshot", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function pdftoppm(inputs) {
  return createNode("lib.pdf.Pdftoppm", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractOcr(inputs) {
  return createNode("lib.pdf.ExtractOcr", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
