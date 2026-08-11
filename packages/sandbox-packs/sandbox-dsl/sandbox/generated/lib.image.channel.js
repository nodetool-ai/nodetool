// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function shuffle(inputs) {
  return createNode("lib.image.channel.Shuffle", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function merge(inputs) {
  return createNode("lib.image.channel.Merge", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  merge,
  shuffle
};
