// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function getDatabasePath(inputs) {
  return callNode("lib.sqlite.GetDatabasePath", inputs);
}
export {
  getDatabasePath
};
