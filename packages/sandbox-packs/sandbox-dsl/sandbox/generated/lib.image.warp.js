// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function offset(inputs, options) {
  return createNode("lib.image.warp.Offset", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function pad(inputs, options) {
  return createNode("lib.image.warp.Pad", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function tile(inputs, options) {
  return createNode("lib.image.warp.Tile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function affine(inputs, options) {
  return createNode("lib.image.warp.Affine", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function cornerPin(inputs, options) {
  return createNode("lib.image.warp.CornerPin", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function polarRemap(inputs, options) {
  return createNode("lib.image.warp.PolarRemap", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function displace(inputs, options) {
  return createNode("lib.image.warp.Displace", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function spherize(inputs, options) {
  return createNode("lib.image.warp.Spherize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  affine,
  cornerPin,
  displace,
  offset,
  pad,
  polarRemap,
  spherize,
  tile
};
