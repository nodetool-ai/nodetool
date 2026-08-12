// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadModel3DFile(inputs) {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveModel3DFile(inputs) {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveModel3D(inputs) {
  return createNode("nodetool.model3d.SaveModel3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function formatConverter(inputs) {
  return createNode("nodetool.model3d.FormatConverter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getModel3DMetadata(inputs) {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function transform3D(inputs) {
  return createNode("nodetool.model3d.Transform3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function decimate(inputs) {
  return createNode("nodetool.model3d.Decimate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function boolean3D(inputs) {
  return createNode("nodetool.model3d.Boolean3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function recalculateNormals(inputs) {
  return createNode("nodetool.model3d.RecalculateNormals", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function centerMesh(inputs) {
  return createNode("nodetool.model3d.CenterMesh", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function flipNormals(inputs) {
  return createNode("nodetool.model3d.FlipNormals", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function normalizeModel3D(inputs) {
  return createNode("nodetool.model3d.NormalizeModel3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function extractLargestComponent(inputs) {
  return createNode("nodetool.model3d.ExtractLargestComponent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function repairMesh(inputs) {
  return createNode("nodetool.model3d.RepairMesh", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function mergeMeshes(inputs) {
  return createNode("nodetool.model3d.MergeMeshes", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function textTo3D(inputs) {
  return createNode("nodetool.model3d.TextTo3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageTo3D(inputs) {
  return createNode("nodetool.model3d.ImageTo3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function renderToImage(inputs) {
  return createNode("nodetool.model3d.RenderToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
