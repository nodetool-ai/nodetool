// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function normalize(inputs, options) {
  return createNode("nodetool.audio.Normalize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function overlayAudio(inputs, options) {
  return createNode("nodetool.audio.OverlayAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function removeSilence(inputs, options) {
  return createNode("nodetool.audio.RemoveSilence", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function sliceAudio(inputs, options) {
  return createNode("nodetool.audio.SliceAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function monoToStereo(inputs, options) {
  return createNode("nodetool.audio.MonoToStereo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function stereoToMono(inputs, options) {
  return createNode("nodetool.audio.StereoToMono", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function reverse(inputs, options) {
  return createNode("nodetool.audio.Reverse", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function fadeIn(inputs, options) {
  return createNode("nodetool.audio.FadeIn", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function fadeOut(inputs, options) {
  return createNode("nodetool.audio.FadeOut", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function repeat(inputs, options) {
  return createNode("nodetool.audio.Repeat", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function audioMixer(inputs, options) {
  return createNode("nodetool.audio.AudioMixer", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function trim(inputs, options) {
  return createNode("nodetool.audio.Trim", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function createSilence(inputs, options) {
  return createNode("nodetool.audio.CreateSilence", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function concat(inputs, options) {
  return createNode("nodetool.audio.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function concatList(inputs, options) {
  return createNode("nodetool.audio.ConcatList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function chunkToAudio(inputs, options) {
  return createNode("nodetool.audio.ChunkToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: { "audio": "audio" }, defaultOutput: "audio" });
}
function getAudioInfo(inputs, options) {
  return createNode("nodetool.audio.GetAudioInfo", inputs, { id: options?.id, outputNames: ["duration", "sample_rate", "channels", "format", "size_bytes"], outputTypes: { "duration": "float", "sample_rate": "int", "channels": "int", "format": "str", "size_bytes": "int" } });
}
function loadAudioAssets(inputs, options) {
  return createNode("nodetool.audio.LoadAudioAssets", inputs, { id: options?.id, outputNames: ["audio", "name", "audios"], outputTypes: { "audio": "audio", "name": "str", "audios": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "audio": { "kind": "iteration", "source": "__execution__", "group": "items" }, "name": { "kind": "iteration", "source": "__execution__", "group": "items" }, "audios": { "kind": "single", "source": "__execution__" } } });
}
function loadAudioFile(inputs, options) {
  return createNode("nodetool.audio.LoadAudioFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function loadAudioFolder(inputs, options) {
  return createNode("nodetool.audio.LoadAudioFolder", inputs, { id: options?.id, outputNames: ["audio", "path", "audios"], outputTypes: { "audio": "audio", "path": "str", "audios": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "audio": { "kind": "iteration", "source": "__execution__", "group": "items" }, "path": { "kind": "iteration", "source": "__execution__", "group": "items" }, "audios": { "kind": "single", "source": "__execution__" } } });
}
function saveAudio(inputs, options) {
  return createNode("nodetool.audio.SaveAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function saveAudioFile(inputs, options) {
  return createNode("nodetool.audio.SaveAudioFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function textToSpeech(inputs, options) {
  return createNode("nodetool.audio.TextToSpeech", inputs, { id: options?.id, outputNames: ["audio", "chunk"], outputTypes: { "audio": "audio", "chunk": "chunk" }, inputMode: "buffered", outputCorrelation: { "audio": { "kind": "single", "source": "__execution__" }, "chunk": { "kind": "single", "source": "__execution__" } } });
}
function textToMusic(inputs, options) {
  return createNode("nodetool.audio.TextToMusic", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: { "audio": "audio" }, defaultOutput: "audio", inputMode: "buffered", outputCorrelation: { "audio": { "kind": "single", "source": "__execution__" } } });
}
function audioToAudio(inputs, options) {
  return createNode("nodetool.audio.AudioToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: { "audio": "audio" }, defaultOutput: "audio", inputMode: "buffered", outputCorrelation: { "audio": { "kind": "single", "source": "__execution__" } } });
}
export {
  audioMixer,
  audioToAudio,
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
