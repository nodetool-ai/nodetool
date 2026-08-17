// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function collection(inputs) {
  return callNode("vector.Collection", inputs);
}
function count(inputs) {
  return callNode("vector.Count", inputs);
}
function getDocuments(inputs) {
  return callNode("vector.GetDocuments", inputs);
}
function peek(inputs) {
  return callNode("vector.Peek", inputs);
}
function indexImage(inputs) {
  return callNode("vector.IndexImage", inputs);
}
function indexEmbedding(inputs) {
  return callNode("vector.IndexEmbedding", inputs);
}
function indexTextChunk(inputs) {
  return callNode("vector.IndexTextChunk", inputs);
}
function indexAggregatedText(inputs) {
  return callNode("vector.IndexAggregatedText", inputs);
}
function indexString(inputs) {
  return callNode("vector.IndexString", inputs);
}
function queryImage(inputs) {
  return callNode("vector.QueryImage", inputs);
}
function queryText(inputs) {
  return callNode("vector.QueryText", inputs);
}
function removeOverlap(inputs) {
  return callNode("vector.RemoveOverlap", inputs);
}
function hybridSearch(inputs) {
  return callNode("vector.HybridSearch", inputs);
}
export {
  collection,
  count,
  getDocuments,
  hybridSearch,
  indexAggregatedText,
  indexEmbedding,
  indexImage,
  indexString,
  indexTextChunk,
  peek,
  queryImage,
  queryText,
  removeOverlap
};
