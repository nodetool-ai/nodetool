// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function paste(inputs, options) {
  return createNode("nodetool.image.Paste", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function scale(inputs, options) {
  return createNode("nodetool.image.Scale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function resizeImage(inputs, options) {
  return createNode("nodetool.image.ResizeImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function resize(inputs, options) {
  return createNode("nodetool.image.Resize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function canvasResize(inputs, options) {
  return createNode("nodetool.image.CanvasResize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function crop(inputs, options) {
  return createNode("nodetool.image.Crop", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function fit(inputs, options) {
  return createNode("nodetool.image.Fit", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function rotateAndFlip(inputs, options) {
  return createNode("nodetool.image.RotateAndFlip", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function channels(inputs, options) {
  return createNode("nodetool.image.Channels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function blur(inputs, options) {
  return createNode("nodetool.image.Blur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function levels(inputs, options) {
  return createNode("nodetool.image.Levels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function compositor(inputs, options) {
  return createNode("nodetool.image.Compositor", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function loadImageFile(inputs, options) {
  return createNode("nodetool.image.LoadImageFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function loadImageFolder(inputs, options) {
  return createNode("nodetool.image.LoadImageFolder", inputs, { id: options?.id, outputNames: ["image", "path", "images"], outputTypes: { "image": "image", "path": "str", "images": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "image": { "kind": "iteration", "source": "__execution__", "group": "items" }, "path": { "kind": "iteration", "source": "__execution__", "group": "items" }, "images": { "kind": "single", "source": "__execution__" } } });
}
function saveImageFile(inputs, options) {
  return createNode("nodetool.image.SaveImageFile", inputs, { id: options?.id, outputNames: ["output", "path"], outputTypes: { "output": "image", "path": "str" } });
}
function loadImageAssets(inputs, options) {
  return createNode("nodetool.image.LoadImageAssets", inputs, { id: options?.id, outputNames: ["image", "name", "images"], outputTypes: { "image": "image", "name": "str", "images": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "image": { "kind": "iteration", "source": "__execution__", "group": "items" }, "name": { "kind": "iteration", "source": "__execution__", "group": "items" }, "images": { "kind": "single", "source": "__execution__" } } });
}
function saveImage(inputs, options) {
  return createNode("nodetool.image.SaveImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function getMetadata(inputs, options) {
  return createNode("nodetool.image.GetMetadata", inputs, { id: options?.id, outputNames: ["format", "mode", "width", "height", "channels"], outputTypes: { "format": "str", "mode": "str", "width": "int", "height": "int", "channels": "int" } });
}
function batchToList(inputs, options) {
  return createNode("nodetool.image.BatchToList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function imagesToList(inputs, options) {
  return createNode("nodetool.image.ImagesToList", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function painter(inputs, options) {
  return createNode("nodetool.image.Painter", inputs, { id: options?.id, outputNames: ["mask", "image"], outputTypes: { "mask": "image", "image": "image" } });
}
function textToImage(inputs, options) {
  return createNode("nodetool.image.TextToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function imageToImage(inputs, options) {
  return createNode("nodetool.image.ImageToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function upscale(inputs, options) {
  return createNode("nodetool.image.Upscale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function removeBackground(inputs, options) {
  return createNode("nodetool.image.RemoveBackground", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function relight(inputs, options) {
  return createNode("nodetool.image.Relight", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function vectorize(inputs, options) {
  return createNode("nodetool.image.Vectorize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "svg_element" }, defaultOutput: "output" });
}
function segment(inputs, options) {
  return createNode("nodetool.image.Segment", inputs, { id: options?.id, outputNames: ["masks", "labels", "scores"], outputTypes: { "masks": "list[image]", "labels": "list[str]", "scores": "list[float]" } });
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
  resizeImage,
  rotateAndFlip,
  saveImage,
  saveImageFile,
  scale,
  segment,
  textToImage,
  upscale,
  vectorize
};
