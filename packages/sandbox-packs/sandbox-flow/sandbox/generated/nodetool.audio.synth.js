// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function oscillator(inputs) {
  return callNode("nodetool.audio.synth.Oscillator", inputs);
}
oscillator.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.Oscillator", inputs);
};
function lfo(inputs) {
  return callNode("nodetool.audio.synth.LFO", inputs);
}
lfo.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.LFO", inputs);
};
function adsr(inputs) {
  return callNode("nodetool.audio.synth.ADSR", inputs);
}
adsr.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.ADSR", inputs);
};
function gate(inputs) {
  return callNode("nodetool.audio.synth.Gate", inputs);
}
gate.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.Gate", inputs);
};
function vca(inputs) {
  return callNode("nodetool.audio.synth.VCA", inputs);
}
vca.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.VCA", inputs);
};
function vcf(inputs) {
  return callNode("nodetool.audio.synth.VCF", inputs);
}
vcf.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.VCF", inputs);
};
function attenuverter(inputs) {
  return callNode("nodetool.audio.synth.Attenuverter", inputs);
}
attenuverter.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.Attenuverter", inputs);
};
function sampleHold(inputs) {
  return callNode("nodetool.audio.synth.SampleHold", inputs);
}
sampleHold.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.SampleHold", inputs);
};
function mixer(inputs) {
  return callNode("nodetool.audio.synth.Mixer", inputs);
}
mixer.stream = function(inputs) {
  return streamNode("nodetool.audio.synth.Mixer", inputs);
};
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
