// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToVideo(inputs, options) {
  return createNode("nodetool.video.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function imageToVideo(inputs, options) {
  return createNode("nodetool.video.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function referenceToVideo(inputs, options) {
  return createNode("nodetool.video.ReferenceToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function loadVideoFile(inputs, options) {
  return createNode("nodetool.video.LoadVideoFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function saveVideoFile(inputs, options) {
  return createNode("nodetool.video.SaveVideoFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function loadVideoAssets(inputs, options) {
  return createNode("nodetool.video.LoadVideoAssets", inputs, { id: options?.id, outputNames: ["video", "name", "videos", "names"], outputTypes: { "video": "video", "name": "str", "videos": "list", "names": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "video": { "kind": "iteration", "source": "__execution__", "group": "items" }, "name": { "kind": "iteration", "source": "__execution__", "group": "items" }, "videos": { "kind": "single", "source": "__execution__" }, "names": { "kind": "single", "source": "__execution__" } } });
}
function saveVideo(inputs, options) {
  return createNode("nodetool.video.SaveVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function forEachFrame(inputs, options) {
  return createNode("nodetool.video.ForEachFrame", inputs, { id: options?.id, outputNames: ["frame", "index", "fps"], outputTypes: { "frame": "image", "index": "int", "fps": "float" }, streaming: true, inputMode: "buffered", outputCorrelation: { "frame": { "kind": "iteration", "source": "video", "group": "items" }, "index": { "kind": "iteration", "source": "video", "group": "items" }, "fps": { "kind": "single", "source": "video" } } });
}
function fps(inputs, options) {
  return createNode("nodetool.video.Fps", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "float" }, defaultOutput: "output" });
}
function frameToVideo(inputs, options) {
  return createNode("nodetool.video.FrameToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "aggregate", "source": "frame", "collapse": "innermost" } } });
}
function concat(inputs, options) {
  return createNode("nodetool.video.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function trim(inputs, options) {
  return createNode("nodetool.video.Trim", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function resize(inputs, options) {
  return createNode("nodetool.video.Resize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function rotate(inputs, options) {
  return createNode("nodetool.video.Rotate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function setSpeed(inputs, options) {
  return createNode("nodetool.video.SetSpeed", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function overlay(inputs, options) {
  return createNode("nodetool.video.Overlay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function colorBalance(inputs, options) {
  return createNode("nodetool.video.ColorBalance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function denoise(inputs, options) {
  return createNode("nodetool.video.Denoise", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function stabilize(inputs, options) {
  return createNode("nodetool.video.Stabilize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function sharpness(inputs, options) {
  return createNode("nodetool.video.Sharpness", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function blur(inputs, options) {
  return createNode("nodetool.video.Blur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function saturation(inputs, options) {
  return createNode("nodetool.video.Saturation", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function addSubtitles(inputs, options) {
  return createNode("nodetool.video.AddSubtitles", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function reverse(inputs, options) {
  return createNode("nodetool.video.Reverse", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function transition(inputs, options) {
  return createNode("nodetool.video.Transition", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function addAudio(inputs, options) {
  return createNode("nodetool.video.AddAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function chromaKey(inputs, options) {
  return createNode("nodetool.video.ChromaKey", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function extractAudio(inputs, options) {
  return createNode("nodetool.video.ExtractAudio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function extractFrame(inputs, options) {
  return createNode("nodetool.video.ExtractFrame", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function getVideoInfo(inputs, options) {
  return createNode("nodetool.video.GetVideoInfo", inputs, { id: options?.id, outputNames: ["duration", "width", "height", "fps", "frame_count", "codec", "has_audio"], outputTypes: { "duration": "float", "width": "int", "height": "int", "fps": "float", "frame_count": "int", "codec": "str", "has_audio": "bool" } });
}
function videoToVideo(inputs, options) {
  return createNode("nodetool.video.VideoToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function lipSync(inputs, options) {
  return createNode("nodetool.video.LipSync", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
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
  referenceToVideo,
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
