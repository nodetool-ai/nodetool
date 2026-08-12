// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function gain(inputs) {
  return createNode("lib.audio.Gain", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function delay(inputs) {
  return createNode("lib.audio.Delay", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function highPassFilter(inputs) {
  return createNode("lib.audio.HighPassFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function lowPassFilter(inputs) {
  return createNode("lib.audio.LowPassFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function highShelfFilter(inputs) {
  return createNode("lib.audio.HighShelfFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function lowShelfFilter(inputs) {
  return createNode("lib.audio.LowShelfFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function peakFilter(inputs) {
  return createNode("lib.audio.PeakFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function bitcrush(inputs) {
  return createNode("lib.audio.Bitcrush", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function compress(inputs) {
  return createNode("lib.audio.Compress", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function distortion(inputs) {
  return createNode("lib.audio.Distortion", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function limiter(inputs) {
  return createNode("lib.audio.Limiter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function reverb(inputs) {
  return createNode("lib.audio.Reverb", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function noiseGate(inputs) {
  return createNode("lib.audio.NoiseGate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function phaser(inputs) {
  return createNode("lib.audio.Phaser", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function pitchShift(inputs) {
  return createNode("lib.audio.PitchShift", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function timeStretch(inputs) {
  return createNode("lib.audio.TimeStretch", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
