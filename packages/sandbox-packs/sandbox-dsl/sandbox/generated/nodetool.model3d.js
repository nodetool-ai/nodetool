// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadModel3DFile(inputs, options) {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function saveModel3DFile(inputs, options) {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function saveModel3D(inputs, options) {
  return createNode("nodetool.model3d.SaveModel3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function formatConverter(inputs, options) {
  return createNode("nodetool.model3d.FormatConverter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function getModel3DMetadata(inputs, options) {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dict" }, defaultOutput: "output" });
}
function transform3D(inputs, options) {
  return createNode("nodetool.model3d.Transform3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function decimate(inputs, options) {
  return createNode("nodetool.model3d.Decimate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function boolean3D(inputs, options) {
  return createNode("nodetool.model3d.Boolean3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function recalculateNormals(inputs, options) {
  return createNode("nodetool.model3d.RecalculateNormals", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function centerMesh(inputs, options) {
  return createNode("nodetool.model3d.CenterMesh", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function flipNormals(inputs, options) {
  return createNode("nodetool.model3d.FlipNormals", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function normalizeModel3D(inputs, options) {
  return createNode("nodetool.model3d.NormalizeModel3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function extractLargestComponent(inputs, options) {
  return createNode("nodetool.model3d.ExtractLargestComponent", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function repairMesh(inputs, options) {
  return createNode("nodetool.model3d.RepairMesh", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function mergeMeshes(inputs, options) {
  return createNode("nodetool.model3d.MergeMeshes", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function textTo3D(inputs, options) {
  return createNode("nodetool.model3d.TextTo3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function imageTo3D(inputs, options) {
  return createNode("nodetool.model3d.ImageTo3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function renderToImage(inputs, options) {
  return createNode("nodetool.model3d.RenderToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  boolean3D,
  centerMesh,
  decimate,
  extractLargestComponent,
  flipNormals,
  formatConverter,
  getModel3DMetadata,
  imageTo3D,
  loadModel3DFile,
  mergeMeshes,
  normalizeModel3D,
  recalculateNormals,
  renderToImage,
  repairMesh,
  saveModel3D,
  saveModel3DFile,
  textTo3D,
  transform3D
};
