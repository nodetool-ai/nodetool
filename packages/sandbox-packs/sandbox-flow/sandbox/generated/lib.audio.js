// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function gain(inputs) {
  return callNode("lib.audio.Gain", inputs);
}
function delay(inputs) {
  return callNode("lib.audio.Delay", inputs);
}
function highPassFilter(inputs) {
  return callNode("lib.audio.HighPassFilter", inputs);
}
function lowPassFilter(inputs) {
  return callNode("lib.audio.LowPassFilter", inputs);
}
function highShelfFilter(inputs) {
  return callNode("lib.audio.HighShelfFilter", inputs);
}
function lowShelfFilter(inputs) {
  return callNode("lib.audio.LowShelfFilter", inputs);
}
function peakFilter(inputs) {
  return callNode("lib.audio.PeakFilter", inputs);
}
function bitcrush(inputs) {
  return callNode("lib.audio.Bitcrush", inputs);
}
function compress(inputs) {
  return callNode("lib.audio.Compress", inputs);
}
function distortion(inputs) {
  return callNode("lib.audio.Distortion", inputs);
}
function limiter(inputs) {
  return callNode("lib.audio.Limiter", inputs);
}
function reverb(inputs) {
  return callNode("lib.audio.Reverb", inputs);
}
function noiseGate(inputs) {
  return callNode("lib.audio.NoiseGate", inputs);
}
function phaser(inputs) {
  return callNode("lib.audio.Phaser", inputs);
}
function pitchShift(inputs) {
  return callNode("lib.audio.PitchShift", inputs);
}
function timeStretch(inputs) {
  return callNode("lib.audio.TimeStretch", inputs);
}
export {
  bitcrush,
  compress,
  delay,
  distortion,
  gain,
  highPassFilter,
  highShelfFilter,
  limiter,
  lowPassFilter,
  lowShelfFilter,
  noiseGate,
  peakFilter,
  phaser,
  pitchShift,
  reverb,
  timeStretch
};
