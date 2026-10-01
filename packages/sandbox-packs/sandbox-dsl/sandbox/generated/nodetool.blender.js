// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderImage(inputs, options) {
  return createNode("nodetool.blender.RenderImage", inputs, { id: options?.id, outputNames: ["image"], outputTypes: { "image": "image" }, defaultOutput: "image" });
}
function renderPasses(inputs, options) {
  return createNode("nodetool.blender.RenderPasses", inputs, { id: options?.id, outputNames: ["color", "depth", "depth_near", "depth_far", "normal", "mask"], outputTypes: { "color": "image", "depth": "image", "depth_near": "float", "depth_far": "float", "normal": "image", "mask": "image" } });
}
function renderAnimation(inputs, options) {
  return createNode("nodetool.blender.RenderAnimation", inputs, { id: options?.id, outputNames: ["video"], outputTypes: { "video": "video" }, defaultOutput: "video" });
}
function bakeTimelineClip(inputs, options) {
  return createNode("nodetool.blender.BakeTimelineClip", inputs, { id: options?.id, outputNames: ["video"], outputTypes: { "video": "video" }, defaultOutput: "video" });
}
function prepareForEngine(inputs, options) {
  return createNode("nodetool.blender.PrepareForEngine", inputs, { id: options?.id, outputNames: ["model", "lods"], outputTypes: { "model": "model_3d", "lods": "list[model_3d]" } });
}
function exportModel(inputs, options) {
  return createNode("nodetool.blender.ExportModel", inputs, { id: options?.id, outputNames: ["file"], outputTypes: { "file": "asset" }, defaultOutput: "file" });
}
export {
  bakeTimelineClip,
  exportModel,
  prepareForEngine,
  renderAnimation,
  renderImage,
  renderPasses
};
