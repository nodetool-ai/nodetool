// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToVideo(inputs) {
  return createNode("nodetool.video.TextToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageToVideo(inputs) {
  return createNode("nodetool.video.ImageToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadVideoFile(inputs) {
  return createNode("nodetool.video.LoadVideoFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveVideoFile(inputs) {
  return createNode("nodetool.video.SaveVideoFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadVideoAssets(inputs) {
  return createNode("nodetool.video.LoadVideoAssets", inputs, { outputNames: ["video", "name", "videos", "names"], streaming: true });
}
function saveVideo(inputs) {
  return createNode("nodetool.video.SaveVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function forEachFrame(inputs) {
  return createNode("nodetool.video.ForEachFrame", inputs, { outputNames: ["frame", "index", "fps"], streaming: true });
}
function fps(inputs) {
  return createNode("nodetool.video.Fps", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function frameToVideo(inputs) {
  return createNode("nodetool.video.FrameToVideo", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}
function concat(inputs) {
  return createNode("nodetool.video.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function trim(inputs) {
  return createNode("nodetool.video.Trim", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function resize(inputs) {
  return createNode("nodetool.video.Resize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function rotate(inputs) {
  return createNode("nodetool.video.Rotate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function setSpeed(inputs) {
  return createNode("nodetool.video.SetSpeed", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function overlay(inputs) {
  return createNode("nodetool.video.Overlay", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function colorBalance(inputs) {
  return createNode("nodetool.video.ColorBalance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function denoise(inputs) {
  return createNode("nodetool.video.Denoise", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function stabilize(inputs) {
  return createNode("nodetool.video.Stabilize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sharpness(inputs) {
  return createNode("nodetool.video.Sharpness", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function blur(inputs) {
  return createNode("nodetool.video.Blur", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saturation(inputs) {
  return createNode("nodetool.video.Saturation", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function addSubtitles(inputs) {
  return createNode("nodetool.video.AddSubtitles", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function reverse(inputs) {
  return createNode("nodetool.video.Reverse", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function transition(inputs) {
  return createNode("nodetool.video.Transition", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function addAudio(inputs) {
  return createNode("nodetool.video.AddAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function chromaKey(inputs) {
  return createNode("nodetool.video.ChromaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractAudio(inputs) {
  return createNode("nodetool.video.ExtractAudio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractFrame(inputs) {
  return createNode("nodetool.video.ExtractFrame", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getVideoInfo(inputs) {
  return createNode("nodetool.video.GetVideoInfo", inputs, { outputNames: ["duration", "width", "height", "fps", "frame_count", "codec", "has_audio"] });
}
function videoToVideo(inputs) {
  return createNode("nodetool.video.VideoToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function lipSync(inputs) {
  return createNode("nodetool.video.LipSync", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  addAudio,
  addSubtitles,
  blur,
  chromaKey,
  colorBalance,
  concat,
  denoise,
  extractAudio,
  extractFrame,
  forEachFrame,
  fps,
  frameToVideo,
  getVideoInfo,
  imageToVideo,
  lipSync,
  loadVideoAssets,
  loadVideoFile,
  overlay,
  resize,
  reverse,
  rotate,
  saturation,
  saveVideo,
  saveVideoFile,
  setSpeed,
  sharpness,
  stabilize,
  textToVideo,
  transition,
  trim,
  videoToVideo
};
