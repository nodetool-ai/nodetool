// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function textToVideo(inputs) {
  return callNode("nodetool.video.TextToVideo", inputs);
}
function imageToVideo(inputs) {
  return callNode("nodetool.video.ImageToVideo", inputs);
}
function loadVideoFile(inputs) {
  return callNode("nodetool.video.LoadVideoFile", inputs);
}
function saveVideoFile(inputs) {
  return callNode("nodetool.video.SaveVideoFile", inputs);
}
function loadVideoAssets(inputs) {
  return callNode("nodetool.video.LoadVideoAssets", inputs);
}
loadVideoAssets.stream = function(inputs) {
  return streamNode("nodetool.video.LoadVideoAssets", inputs);
};
function saveVideo(inputs) {
  return callNode("nodetool.video.SaveVideo", inputs);
}
function forEachFrame(inputs) {
  return callNode("nodetool.video.ForEachFrame", inputs);
}
forEachFrame.stream = function(inputs) {
  return streamNode("nodetool.video.ForEachFrame", inputs);
};
function fps(inputs) {
  return callNode("nodetool.video.Fps", inputs);
}
function frameToVideo(inputs) {
  return callNode("nodetool.video.FrameToVideo", inputs);
}
frameToVideo.stream = function(inputs) {
  return streamNode("nodetool.video.FrameToVideo", inputs);
};
function concat(inputs) {
  return callNode("nodetool.video.Concat", inputs ?? {});
}
function trim(inputs) {
  return callNode("nodetool.video.Trim", inputs);
}
function resize(inputs) {
  return callNode("nodetool.video.Resize", inputs);
}
function rotate(inputs) {
  return callNode("nodetool.video.Rotate", inputs);
}
function setSpeed(inputs) {
  return callNode("nodetool.video.SetSpeed", inputs);
}
function overlay(inputs) {
  return callNode("nodetool.video.Overlay", inputs);
}
function colorBalance(inputs) {
  return callNode("nodetool.video.ColorBalance", inputs);
}
function denoise(inputs) {
  return callNode("nodetool.video.Denoise", inputs);
}
function stabilize(inputs) {
  return callNode("nodetool.video.Stabilize", inputs);
}
function sharpness(inputs) {
  return callNode("nodetool.video.Sharpness", inputs);
}
function blur(inputs) {
  return callNode("nodetool.video.Blur", inputs);
}
function saturation(inputs) {
  return callNode("nodetool.video.Saturation", inputs);
}
function addSubtitles(inputs) {
  return callNode("nodetool.video.AddSubtitles", inputs);
}
function reverse(inputs) {
  return callNode("nodetool.video.Reverse", inputs);
}
function transition(inputs) {
  return callNode("nodetool.video.Transition", inputs);
}
function addAudio(inputs) {
  return callNode("nodetool.video.AddAudio", inputs);
}
function chromaKey(inputs) {
  return callNode("nodetool.video.ChromaKey", inputs);
}
function extractAudio(inputs) {
  return callNode("nodetool.video.ExtractAudio", inputs);
}
function extractFrame(inputs) {
  return callNode("nodetool.video.ExtractFrame", inputs);
}
function getVideoInfo(inputs) {
  return callNode("nodetool.video.GetVideoInfo", inputs);
}
function videoToVideo(inputs) {
  return callNode("nodetool.video.VideoToVideo", inputs);
}
function lipSync(inputs) {
  return callNode("nodetool.video.LipSync", inputs);
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
