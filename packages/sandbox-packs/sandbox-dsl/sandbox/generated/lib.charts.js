// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chartRenderer(inputs) {
  return createNode("lib.charts.ChartRenderer", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  chartRenderer
};
