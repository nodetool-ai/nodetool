// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function normalize(inputs) {
  return callNode("nodetool.audio.Normalize", inputs);
}
function overlayAudio(inputs) {
  return callNode("nodetool.audio.OverlayAudio", inputs);
}
function removeSilence(inputs) {
  return callNode("nodetool.audio.RemoveSilence", inputs);
}
function sliceAudio(inputs) {
  return callNode("nodetool.audio.SliceAudio", inputs);
}
function monoToStereo(inputs) {
  return callNode("nodetool.audio.MonoToStereo", inputs);
}
function stereoToMono(inputs) {
  return callNode("nodetool.audio.StereoToMono", inputs);
}
function reverse(inputs) {
  return callNode("nodetool.audio.Reverse", inputs);
}
function fadeIn(inputs) {
  return callNode("nodetool.audio.FadeIn", inputs);
}
function fadeOut(inputs) {
  return callNode("nodetool.audio.FadeOut", inputs);
}
function repeat(inputs) {
  return callNode("nodetool.audio.Repeat", inputs);
}
function audioMixer(inputs) {
  return callNode("nodetool.audio.AudioMixer", inputs ?? {});
}
function trim(inputs) {
  return callNode("nodetool.audio.Trim", inputs);
}
function createSilence(inputs) {
  return callNode("nodetool.audio.CreateSilence", inputs);
}
function concat(inputs) {
  return callNode("nodetool.audio.Concat", inputs ?? {});
}
function concatList(inputs) {
  return callNode("nodetool.audio.ConcatList", inputs);
}
function chunkToAudio(inputs) {
  return callNode("nodetool.audio.ChunkToAudio", inputs);
}
function getAudioInfo(inputs) {
  return callNode("nodetool.audio.GetAudioInfo", inputs);
}
function loadAudioAssets(inputs) {
  return callNode("nodetool.audio.LoadAudioAssets", inputs);
}
loadAudioAssets.stream = function(inputs) {
  return streamNode("nodetool.audio.LoadAudioAssets", inputs);
};
function loadAudioFile(inputs) {
  return callNode("nodetool.audio.LoadAudioFile", inputs);
}
function loadAudioFolder(inputs) {
  return callNode("nodetool.audio.LoadAudioFolder", inputs);
}
loadAudioFolder.stream = function(inputs) {
  return streamNode("nodetool.audio.LoadAudioFolder", inputs);
};
function saveAudio(inputs) {
  return callNode("nodetool.audio.SaveAudio", inputs);
}
function saveAudioFile(inputs) {
  return callNode("nodetool.audio.SaveAudioFile", inputs);
}
function textToSpeech(inputs) {
  return callNode("nodetool.audio.TextToSpeech", inputs);
}
function textToMusic(inputs) {
  return callNode("nodetool.audio.TextToMusic", inputs);
}
export {
  audioMixer,
  chunkToAudio,
  concat,
  concatList,
  createSilence,
  fadeIn,
  fadeOut,
  getAudioInfo,
  loadAudioAssets,
  loadAudioFile,
  loadAudioFolder,
  monoToStereo,
  normalize,
  overlayAudio,
  removeSilence,
  repeat,
  reverse,
  saveAudio,
  saveAudioFile,
  sliceAudio,
  stereoToMono,
  textToMusic,
  textToSpeech,
  trim
};
