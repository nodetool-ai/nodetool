// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function loadModel3DFile(inputs) {
  return callNode("nodetool.model3d.LoadModel3DFile", inputs);
}
function saveModel3DFile(inputs) {
  return callNode("nodetool.model3d.SaveModel3DFile", inputs);
}
function saveModel3D(inputs) {
  return callNode("nodetool.model3d.SaveModel3D", inputs);
}
function formatConverter(inputs) {
  return callNode("nodetool.model3d.FormatConverter", inputs);
}
function getModel3DMetadata(inputs) {
  return callNode("nodetool.model3d.GetModel3DMetadata", inputs);
}
function transform3D(inputs) {
  return callNode("nodetool.model3d.Transform3D", inputs);
}
function decimate(inputs) {
  return callNode("nodetool.model3d.Decimate", inputs);
}
function boolean3D(inputs) {
  return callNode("nodetool.model3d.Boolean3D", inputs);
}
function recalculateNormals(inputs) {
  return callNode("nodetool.model3d.RecalculateNormals", inputs);
}
function centerMesh(inputs) {
  return callNode("nodetool.model3d.CenterMesh", inputs);
}
function flipNormals(inputs) {
  return callNode("nodetool.model3d.FlipNormals", inputs);
}
function normalizeModel3D(inputs) {
  return callNode("nodetool.model3d.NormalizeModel3D", inputs);
}
function extractLargestComponent(inputs) {
  return callNode("nodetool.model3d.ExtractLargestComponent", inputs);
}
function repairMesh(inputs) {
  return callNode("nodetool.model3d.RepairMesh", inputs);
}
function mergeMeshes(inputs) {
  return callNode("nodetool.model3d.MergeMeshes", inputs);
}
function textTo3D(inputs) {
  return callNode("nodetool.model3d.TextTo3D", inputs);
}
function imageTo3D(inputs) {
  return callNode("nodetool.model3d.ImageTo3D", inputs);
}
function renderToImage(inputs) {
  return callNode("nodetool.model3d.RenderToImage", inputs);
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
