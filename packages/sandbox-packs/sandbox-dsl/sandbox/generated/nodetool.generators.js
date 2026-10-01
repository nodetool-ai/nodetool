// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function structuredOutputGenerator(inputs, options) {
  return createNode("nodetool.generators.StructuredOutputGenerator", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function dataGenerator(inputs, options) {
  return createNode("nodetool.generators.DataGenerator", inputs, { id: options?.id, outputNames: ["record", "dataframe", "index"], outputTypes: { "record": "dict", "dataframe": "dataframe", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "record": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" }, "dataframe": { "kind": "single", "source": "__execution__" } } });
}
function listGenerator(inputs, options) {
  return createNode("nodetool.generators.ListGenerator", inputs, { id: options?.id, outputNames: ["item", "index", "output"], outputTypes: { "item": "str", "index": "int", "output": "list[str]" }, streaming: true, inputMode: "buffered", outputCorrelation: { "item": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" }, "output": { "kind": "single", "source": "__execution__" } } });
}
function chartGenerator(inputs, options) {
  return createNode("nodetool.generators.ChartGenerator", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "chart_config" }, defaultOutput: "output" });
}
function svgGenerator(inputs, options) {
  return createNode("nodetool.generators.SVGGenerator", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[svg_element]" }, defaultOutput: "output" });
}
export {
  chartGenerator,
  dataGenerator,
  listGenerator,
  structuredOutputGenerator,
  svgGenerator
};
