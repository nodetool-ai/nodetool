// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function cdl(inputs) {
  return createNode("lib.image.color_grading.CDL", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function colorBalance(inputs) {
  return createNode("lib.image.color_grading.ColorBalance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function curves(inputs) {
  return createNode("lib.image.color_grading.Curves", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function exposure(inputs) {
  return createNode("lib.image.color_grading.Exposure", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function filmLook(inputs) {
  return createNode("lib.image.color_grading.FilmLook", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function hslAdjust(inputs) {
  return createNode("lib.image.color_grading.HSLAdjust", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function liftGammaGain(inputs) {
  return createNode("lib.image.color_grading.LiftGammaGain", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saturationVibrance(inputs) {
  return createNode("lib.image.color_grading.SaturationVibrance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function splitToning(inputs) {
  return createNode("lib.image.color_grading.SplitToning", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function vignette(inputs) {
  return createNode("lib.image.color_grading.Vignette", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
