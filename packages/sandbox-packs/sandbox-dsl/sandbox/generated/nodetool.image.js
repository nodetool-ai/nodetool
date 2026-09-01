// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function paste(inputs) {
  return createNode("nodetool.image.Paste", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function scale(inputs) {
  return createNode("nodetool.image.Scale", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function resize(inputs) {
  return createNode("nodetool.image.Resize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function canvasResize(inputs) {
  return createNode("nodetool.image.CanvasResize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function crop(inputs) {
  return createNode("nodetool.image.Crop", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function fit(inputs) {
  return createNode("nodetool.image.Fit", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function rotateAndFlip(inputs) {
  return createNode("nodetool.image.RotateAndFlip", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function channels(inputs) {
  return createNode("nodetool.image.Channels", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function blur(inputs) {
  return createNode("nodetool.image.Blur", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function levels(inputs) {
  return createNode("nodetool.image.Levels", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function compositor(inputs) {
  return createNode("nodetool.image.Compositor", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadImageFile(inputs) {
  return createNode("nodetool.image.LoadImageFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadImageFolder(inputs) {
  return createNode("nodetool.image.LoadImageFolder", inputs, { outputNames: ["image", "path", "images"], streaming: true });
}
function saveImageFile(inputs) {
  return createNode("nodetool.image.SaveImageFile", inputs, { outputNames: ["output", "path"] });
}
function loadImageAssets(inputs) {
  return createNode("nodetool.image.LoadImageAssets", inputs, { outputNames: ["image", "name", "images"], streaming: true });
}
function saveImage(inputs) {
  return createNode("nodetool.image.SaveImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getMetadata(inputs) {
  return createNode("nodetool.image.GetMetadata", inputs, { outputNames: ["format", "mode", "width", "height", "channels"] });
}
function batchToList(inputs) {
  return createNode("nodetool.image.BatchToList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imagesToList(inputs) {
  return createNode("nodetool.image.ImagesToList", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function painter(inputs) {
  return createNode("nodetool.image.Painter", inputs, { outputNames: ["mask", "image"] });
}
function textToImage(inputs) {
  return createNode("nodetool.image.TextToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageToImage(inputs) {
  return createNode("nodetool.image.ImageToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function upscale(inputs) {
  return createNode("nodetool.image.Upscale", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function removeBackground(inputs) {
  return createNode("nodetool.image.RemoveBackground", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function relight(inputs) {
  return createNode("nodetool.image.Relight", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function vectorize(inputs) {
  return createNode("nodetool.image.Vectorize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function segment(inputs) {
  return createNode("nodetool.image.Segment", inputs, { outputNames: ["masks", "labels", "scores"] });
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
  segment,
  textToImage,
  upscale,
  vectorize
};
