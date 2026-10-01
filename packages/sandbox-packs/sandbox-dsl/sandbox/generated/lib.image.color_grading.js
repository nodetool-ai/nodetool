// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function cdl(inputs, options) {
  return createNode("lib.image.color_grading.CDL", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function colorBalance(inputs, options) {
  return createNode("lib.image.color_grading.ColorBalance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function curves(inputs, options) {
  return createNode("lib.image.color_grading.Curves", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function exposure(inputs, options) {
  return createNode("lib.image.color_grading.Exposure", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function filmLook(inputs, options) {
  return createNode("lib.image.color_grading.FilmLook", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function hslAdjust(inputs, options) {
  return createNode("lib.image.color_grading.HSLAdjust", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function liftGammaGain(inputs, options) {
  return createNode("lib.image.color_grading.LiftGammaGain", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function saturationVibrance(inputs, options) {
  return createNode("lib.image.color_grading.SaturationVibrance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function splitToning(inputs, options) {
  return createNode("lib.image.color_grading.SplitToning", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function vignette(inputs, options) {
  return createNode("lib.image.color_grading.Vignette", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  cdl,
  colorBalance,
  curves,
  exposure,
  filmLook,
  hslAdjust,
  liftGammaGain,
  saturationVibrance,
  splitToning,
  vignette
};
