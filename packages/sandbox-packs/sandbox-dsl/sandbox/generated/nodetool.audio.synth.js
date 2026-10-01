// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function oscillator(inputs, options) {
  return createNode("nodetool.audio.synth.Oscillator", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function lfo(inputs, options) {
  return createNode("nodetool.audio.synth.LFO", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: { "cv": "cv" }, defaultOutput: "cv", streamingInput: true });
}
function adsr(inputs, options) {
  return createNode("nodetool.audio.synth.ADSR", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: { "cv": "cv" }, defaultOutput: "cv", streamingInput: true });
}
function gate(inputs, options) {
  return createNode("nodetool.audio.synth.Gate", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: { "cv": "cv" }, defaultOutput: "cv", streamingInput: true });
}
function vca(inputs, options) {
  return createNode("nodetool.audio.synth.VCA", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function vcf(inputs, options) {
  return createNode("nodetool.audio.synth.VCF", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function attenuverter(inputs, options) {
  return createNode("nodetool.audio.synth.Attenuverter", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: { "cv": "cv" }, defaultOutput: "cv", streamingInput: true });
}
function sampleHold(inputs, options) {
  return createNode("nodetool.audio.synth.SampleHold", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: { "cv": "cv" }, defaultOutput: "cv", streamingInput: true });
}
function mixer(inputs, options) {
  return createNode("nodetool.audio.synth.Mixer", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
export {
  adsr,
  attenuverter,
  gate,
  lfo,
  mixer,
  oscillator,
  sampleHold,
  vca,
  vcf
};
