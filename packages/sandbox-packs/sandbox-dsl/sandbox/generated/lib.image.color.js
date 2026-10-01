// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function invert(inputs, options) {
  return createNode("lib.image.color.Invert", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function brightnessContrast(inputs, options) {
  return createNode("lib.image.color.BrightnessContrast", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function hsb(inputs, options) {
  return createNode("lib.image.color.HSB", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function exposure(inputs, options) {
  return createNode("lib.image.color.Exposure", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function posterize(inputs, options) {
  return createNode("lib.image.color.Posterize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function grade(inputs, options) {
  return createNode("lib.image.color.Grade", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function channelSplit(inputs, options) {
  return createNode("lib.image.color.ChannelSplit", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
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
