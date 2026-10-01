// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function getDatabasePath(inputs, options) {
  return createNode("lib.sqlite.GetDatabasePath", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
export {
  getDatabasePath
};
