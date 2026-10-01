// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function gain(inputs, options) {
  return createNode("lib.audio.Gain", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function delay(inputs, options) {
  return createNode("lib.audio.Delay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function highPassFilter(inputs, options) {
  return createNode("lib.audio.HighPassFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function lowPassFilter(inputs, options) {
  return createNode("lib.audio.LowPassFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function highShelfFilter(inputs, options) {
  return createNode("lib.audio.HighShelfFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function lowShelfFilter(inputs, options) {
  return createNode("lib.audio.LowShelfFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function peakFilter(inputs, options) {
  return createNode("lib.audio.PeakFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function bitcrush(inputs, options) {
  return createNode("lib.audio.Bitcrush", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function compress(inputs, options) {
  return createNode("lib.audio.Compress", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function distortion(inputs, options) {
  return createNode("lib.audio.Distortion", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function limiter(inputs, options) {
  return createNode("lib.audio.Limiter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function reverb(inputs, options) {
  return createNode("lib.audio.Reverb", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function noiseGate(inputs, options) {
  return createNode("lib.audio.NoiseGate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function phaser(inputs, options) {
  return createNode("lib.audio.Phaser", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function pitchShift(inputs, options) {
  return createNode("lib.audio.PitchShift", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function timeStretch(inputs, options) {
  return createNode("lib.audio.TimeStretch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
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
