// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function normalize(inputs) {
  return createNode("nodetool.audio.Normalize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function overlayAudio(inputs) {
  return createNode("nodetool.audio.OverlayAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function removeSilence(inputs) {
  return createNode("nodetool.audio.RemoveSilence", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sliceAudio(inputs) {
  return createNode("nodetool.audio.SliceAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function monoToStereo(inputs) {
  return createNode("nodetool.audio.MonoToStereo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function stereoToMono(inputs) {
  return createNode("nodetool.audio.StereoToMono", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function reverse(inputs) {
  return createNode("nodetool.audio.Reverse", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function fadeIn(inputs) {
  return createNode("nodetool.audio.FadeIn", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function fadeOut(inputs) {
  return createNode("nodetool.audio.FadeOut", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function repeat(inputs) {
  return createNode("nodetool.audio.Repeat", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function audioMixer(inputs) {
  return createNode("nodetool.audio.AudioMixer", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function trim(inputs) {
  return createNode("nodetool.audio.Trim", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function createSilence(inputs) {
  return createNode("nodetool.audio.CreateSilence", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function concat(inputs) {
  return createNode("nodetool.audio.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function concatList(inputs) {
  return createNode("nodetool.audio.ConcatList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function chunkToAudio(inputs) {
  return createNode("nodetool.audio.ChunkToAudio", inputs, { outputNames: ["audio"], defaultOutput: "audio" });
}
function getAudioInfo(inputs) {
  return createNode("nodetool.audio.GetAudioInfo", inputs, { outputNames: ["duration", "sample_rate", "channels", "format", "size_bytes"] });
}
function loadAudioAssets(inputs) {
  return createNode("nodetool.audio.LoadAudioAssets", inputs, { outputNames: ["audio", "name", "audios"], streaming: true });
}
function loadAudioFile(inputs) {
  return createNode("nodetool.audio.LoadAudioFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadAudioFolder(inputs) {
  return createNode("nodetool.audio.LoadAudioFolder", inputs, { outputNames: ["audio", "path", "audios"], streaming: true });
}
function saveAudio(inputs) {
  return createNode("nodetool.audio.SaveAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveAudioFile(inputs) {
  return createNode("nodetool.audio.SaveAudioFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function textToSpeech(inputs) {
  return createNode("nodetool.audio.TextToSpeech", inputs, { outputNames: ["audio", "chunk"] });
}
function textToMusic(inputs) {
  return createNode("nodetool.audio.TextToMusic", inputs, { outputNames: ["audio"], defaultOutput: "audio" });
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
