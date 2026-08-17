// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function getSecret(inputs) {
  return callNode("lib.secret.GetSecret", inputs);
}
export {
  getSecret
};
