// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function getDatabasePath(inputs) {
  return createNode("lib.sqlite.GetDatabasePath", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  getDatabasePath
};
