// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function offset(inputs) {
  return callNode("lib.image.warp.Offset", inputs);
}
function pad(inputs) {
  return callNode("lib.image.warp.Pad", inputs);
}
function tile(inputs) {
  return callNode("lib.image.warp.Tile", inputs);
}
function affine(inputs) {
  return callNode("lib.image.warp.Affine", inputs);
}
function cornerPin(inputs) {
  return callNode("lib.image.warp.CornerPin", inputs);
}
function polarRemap(inputs) {
  return callNode("lib.image.warp.PolarRemap", inputs);
}
function displace(inputs) {
  return callNode("lib.image.warp.Displace", inputs);
}
function spherize(inputs) {
  return callNode("lib.image.warp.Spherize", inputs);
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
