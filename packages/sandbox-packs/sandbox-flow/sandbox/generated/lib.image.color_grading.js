// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function cdl(inputs) {
  return callNode("lib.image.color_grading.CDL", inputs);
}
function colorBalance(inputs) {
  return callNode("lib.image.color_grading.ColorBalance", inputs);
}
function curves(inputs) {
  return callNode("lib.image.color_grading.Curves", inputs);
}
function exposure(inputs) {
  return callNode("lib.image.color_grading.Exposure", inputs);
}
function filmLook(inputs) {
  return callNode("lib.image.color_grading.FilmLook", inputs);
}
function hslAdjust(inputs) {
  return callNode("lib.image.color_grading.HSLAdjust", inputs);
}
function liftGammaGain(inputs) {
  return callNode("lib.image.color_grading.LiftGammaGain", inputs);
}
function saturationVibrance(inputs) {
  return callNode("lib.image.color_grading.SaturationVibrance", inputs);
}
function splitToning(inputs) {
  return callNode("lib.image.color_grading.SplitToning", inputs);
}
function vignette(inputs) {
  return callNode("lib.image.color_grading.Vignette", inputs);
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
