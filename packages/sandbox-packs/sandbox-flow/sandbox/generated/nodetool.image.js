// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function paste(inputs) {
  return callNode("nodetool.image.Paste", inputs);
}
function scale(inputs) {
  return callNode("nodetool.image.Scale", inputs);
}
function resize(inputs) {
  return callNode("nodetool.image.Resize", inputs);
}
function canvasResize(inputs) {
  return callNode("nodetool.image.CanvasResize", inputs);
}
function crop(inputs) {
  return callNode("nodetool.image.Crop", inputs);
}
function fit(inputs) {
  return callNode("nodetool.image.Fit", inputs);
}
function rotateAndFlip(inputs) {
  return callNode("nodetool.image.RotateAndFlip", inputs);
}
function channels(inputs) {
  return callNode("nodetool.image.Channels", inputs);
}
function blur(inputs) {
  return callNode("nodetool.image.Blur", inputs);
}
function levels(inputs) {
  return callNode("nodetool.image.Levels", inputs);
}
function compositor(inputs) {
  return callNode("nodetool.image.Compositor", inputs);
}
function loadImageFile(inputs) {
  return callNode("nodetool.image.LoadImageFile", inputs);
}
function loadImageFolder(inputs) {
  return callNode("nodetool.image.LoadImageFolder", inputs);
}
loadImageFolder.stream = function(inputs) {
  return streamNode("nodetool.image.LoadImageFolder", inputs);
};
function saveImageFile(inputs) {
  return callNode("nodetool.image.SaveImageFile", inputs);
}
function loadImageAssets(inputs) {
  return callNode("nodetool.image.LoadImageAssets", inputs);
}
loadImageAssets.stream = function(inputs) {
  return streamNode("nodetool.image.LoadImageAssets", inputs);
};
function saveImage(inputs) {
  return callNode("nodetool.image.SaveImage", inputs);
}
function getMetadata(inputs) {
  return callNode("nodetool.image.GetMetadata", inputs);
}
function batchToList(inputs) {
  return callNode("nodetool.image.BatchToList", inputs);
}
function imagesToList(inputs) {
  return callNode("nodetool.image.ImagesToList", inputs ?? {});
}
function painter(inputs) {
  return callNode("nodetool.image.Painter", inputs);
}
function textToImage(inputs) {
  return callNode("nodetool.image.TextToImage", inputs);
}
function imageToImage(inputs) {
  return callNode("nodetool.image.ImageToImage", inputs);
}
function upscale(inputs) {
  return callNode("nodetool.image.Upscale", inputs);
}
function removeBackground(inputs) {
  return callNode("nodetool.image.RemoveBackground", inputs);
}
function relight(inputs) {
  return callNode("nodetool.image.Relight", inputs);
}
function vectorize(inputs) {
  return callNode("nodetool.image.Vectorize", inputs);
}
export {
  batchToList,
  blur,
  canvasResize,
  channels,
  compositor,
  crop,
  fit,
  getMetadata,
  imageToImage,
  imagesToList,
  levels,
  loadImageAssets,
  loadImageFile,
  loadImageFolder,
  painter,
  paste,
  relight,
  removeBackground,
  resize,
  rotateAndFlip,
  saveImage,
  saveImageFile,
  scale,
  textToImage,
  upscale,
  vectorize
};
