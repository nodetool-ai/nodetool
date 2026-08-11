// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function getSecret(inputs) {
  return createNode("lib.secret.GetSecret", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  getSecret
};
