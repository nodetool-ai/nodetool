// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function shuffle(inputs) {
  return callNode("lib.image.channel.Shuffle", inputs);
}
function merge(inputs) {
  return callNode("lib.image.channel.Merge", inputs);
}
export {
  merge,
  shuffle
};
