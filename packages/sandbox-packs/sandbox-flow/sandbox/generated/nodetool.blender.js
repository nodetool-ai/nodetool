// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function renderImage(inputs) {
  return callNode("nodetool.blender.RenderImage", inputs);
}
function renderPasses(inputs) {
  return callNode("nodetool.blender.RenderPasses", inputs);
}
function renderAnimation(inputs) {
  return callNode("nodetool.blender.RenderAnimation", inputs);
}
function prepareForEngine(inputs) {
  return callNode("nodetool.blender.PrepareForEngine", inputs);
}
function exportModel(inputs) {
  return callNode("nodetool.blender.ExportModel", inputs);
}
export {
  exportModel,
  prepareForEngine,
  renderAnimation,
  renderImage,
  renderPasses
};
