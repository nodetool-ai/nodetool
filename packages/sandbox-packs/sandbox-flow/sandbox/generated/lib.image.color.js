// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function invert(inputs) {
  return callNode("lib.image.color.Invert", inputs);
}
function brightnessContrast(inputs) {
  return callNode("lib.image.color.BrightnessContrast", inputs);
}
function hsb(inputs) {
  return callNode("lib.image.color.HSB", inputs);
}
function exposure(inputs) {
  return callNode("lib.image.color.Exposure", inputs);
}
function posterize(inputs) {
  return callNode("lib.image.color.Posterize", inputs);
}
function grade(inputs) {
  return callNode("lib.image.color.Grade", inputs);
}
function channelSplit(inputs) {
  return callNode("lib.image.color.ChannelSplit", inputs);
}
export {
  brightnessContrast,
  channelSplit,
  exposure,
  grade,
  hsb,
  invert,
  posterize
};
