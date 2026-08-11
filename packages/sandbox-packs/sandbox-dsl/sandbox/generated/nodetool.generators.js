// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function structuredOutputGenerator(inputs) {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs, { outputNames: [] });
}
function dataGenerator(inputs) {
  return createNode("nodetool.generators.DataGenerator", inputs, { outputNames: ["record", "dataframe", "index"], streaming: true });
}
function listGenerator(inputs) {
  return createNode("nodetool.generators.ListGenerator", inputs, { outputNames: ["item", "index", "output"], streaming: true });
}
function chartGenerator(inputs) {
  return createNode("nodetool.generators.ChartGenerator", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function svgGenerator(inputs) {
  return createNode("nodetool.generators.SVGGenerator", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  chartGenerator,
  dataGenerator,
  listGenerator,
  structuredOutputGenerator,
  svgGenerator
};
