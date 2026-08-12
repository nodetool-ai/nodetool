// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function offset(inputs) {
  return createNode("lib.image.warp.Offset", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function pad(inputs) {
  return createNode("lib.image.warp.Pad", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function tile(inputs) {
  return createNode("lib.image.warp.Tile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function affine(inputs) {
  return createNode("lib.image.warp.Affine", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function cornerPin(inputs) {
  return createNode("lib.image.warp.CornerPin", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function polarRemap(inputs) {
  return createNode("lib.image.warp.PolarRemap", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function displace(inputs) {
  return createNode("lib.image.warp.Displace", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function spherize(inputs) {
  return createNode("lib.image.warp.Spherize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
