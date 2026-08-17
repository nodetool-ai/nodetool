// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function chartRenderer(inputs) {
  return callNode("lib.charts.ChartRenderer", inputs);
}
export {
  chartRenderer
};
