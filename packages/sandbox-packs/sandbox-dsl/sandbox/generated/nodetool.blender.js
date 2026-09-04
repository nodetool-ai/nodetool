// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderImage(inputs) {
  return createNode("nodetool.blender.RenderImage", inputs, { outputNames: ["image"], defaultOutput: "image" });
}
function renderPasses(inputs) {
  return createNode("nodetool.blender.RenderPasses", inputs, { outputNames: ["color", "depth", "depth_near", "depth_far", "normal", "mask"] });
}
function renderAnimation(inputs) {
  return createNode("nodetool.blender.RenderAnimation", inputs, { outputNames: ["video"], defaultOutput: "video" });
}
function prepareForEngine(inputs) {
  return createNode("nodetool.blender.PrepareForEngine", inputs, { outputNames: ["model", "lods"] });
}
function exportModel(inputs) {
  return createNode("nodetool.blender.ExportModel", inputs, { outputNames: ["file"], defaultOutput: "file" });
}
export {
  exportModel,
  prepareForEngine,
  renderAnimation,
  renderImage,
  renderPasses
};
