// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function shuffle(inputs, options) {
  return createNode("lib.image.channel.Shuffle", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function merge(inputs, options) {
  return createNode("lib.image.channel.Merge", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  merge,
  shuffle
};
