// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function oscillator(inputs) {
  return createNode("nodetool.audio.synth.Oscillator", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function lfo(inputs) {
  return createNode("nodetool.audio.synth.LFO", inputs, { outputNames: ["cv"], defaultOutput: "cv", streamingInput: true });
}
function adsr(inputs) {
  return createNode("nodetool.audio.synth.ADSR", inputs, { outputNames: ["cv"], defaultOutput: "cv", streamingInput: true });
}
function gate(inputs) {
  return createNode("nodetool.audio.synth.Gate", inputs, { outputNames: ["cv"], defaultOutput: "cv", streamingInput: true });
}
function vca(inputs) {
  return createNode("nodetool.audio.synth.VCA", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function vcf(inputs) {
  return createNode("nodetool.audio.synth.VCF", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function attenuverter(inputs) {
  return createNode("nodetool.audio.synth.Attenuverter", inputs, { outputNames: ["cv"], defaultOutput: "cv", streamingInput: true });
}
function sampleHold(inputs) {
  return createNode("nodetool.audio.synth.SampleHold", inputs, { outputNames: ["cv"], defaultOutput: "cv", streamingInput: true });
}
function mixer(inputs) {
  return createNode("nodetool.audio.synth.Mixer", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
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
