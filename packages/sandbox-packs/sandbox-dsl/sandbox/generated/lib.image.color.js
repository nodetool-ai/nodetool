// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function invert(inputs) {
  return createNode("lib.image.color.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function brightnessContrast(inputs) {
  return createNode("lib.image.color.BrightnessContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function hsb(inputs) {
  return createNode("lib.image.color.HSB", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function exposure(inputs) {
  return createNode("lib.image.color.Exposure", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function posterize(inputs) {
  return createNode("lib.image.color.Posterize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function grade(inputs) {
  return createNode("lib.image.color.Grade", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function channelSplit(inputs) {
  return createNode("lib.image.color.ChannelSplit", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
