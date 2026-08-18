// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function structuredOutputGenerator(inputs) {
  return callNode("nodetool.generators.StructuredOutputGenerator", inputs);
}
function dataGenerator(inputs) {
  return callNode("nodetool.generators.DataGenerator", inputs);
}
dataGenerator.stream = function(inputs) {
  return streamNode("nodetool.generators.DataGenerator", inputs);
};
function listGenerator(inputs) {
  return callNode("nodetool.generators.ListGenerator", inputs);
}
listGenerator.stream = function(inputs) {
  return streamNode("nodetool.generators.ListGenerator", inputs);
};
function chartGenerator(inputs) {
  return callNode("nodetool.generators.ChartGenerator", inputs);
}
function svgGenerator(inputs) {
  return callNode("nodetool.generators.SVGGenerator", inputs);
}
export {
  chartGenerator,
  dataGenerator,
  listGenerator,
  structuredOutputGenerator,
  svgGenerator
};
