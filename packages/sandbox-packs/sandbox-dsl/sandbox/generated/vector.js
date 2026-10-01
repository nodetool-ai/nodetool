// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function collection(inputs, options) {
  return createNode("vector.Collection", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "collection" }, defaultOutput: "output" });
}
function count(inputs, options) {
  return createNode("vector.Count", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "int" }, defaultOutput: "output" });
}
function getDocuments(inputs, options) {
  return createNode("vector.GetDocuments", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[str]" }, defaultOutput: "output" });
}
function peek(inputs, options) {
  return createNode("vector.Peek", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[str]" }, defaultOutput: "output" });
}
function indexImage(inputs, options) {
  return createNode("vector.IndexImage", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function indexEmbedding(inputs, options) {
  return createNode("vector.IndexEmbedding", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function indexTextChunk(inputs, options) {
  return createNode("vector.IndexTextChunk", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function indexAggregatedText(inputs, options) {
  return createNode("vector.IndexAggregatedText", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function indexString(inputs, options) {
  return createNode("vector.IndexString", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function queryImage(inputs, options) {
  return createNode("vector.QueryImage", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances"], outputTypes: { "ids": "list[str]", "documents": "list[str]", "metadatas": "list[dict]", "distances": "list[float]" } });
}
function queryText(inputs, options) {
  return createNode("vector.QueryText", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances"], outputTypes: { "ids": "list[str]", "documents": "list[str]", "metadatas": "list[dict]", "distances": "list[float]" } });
}
function removeOverlap(inputs, options) {
  return createNode("vector.RemoveOverlap", inputs, { id: options?.id, outputNames: ["documents"], outputTypes: { "documents": "list[str]" }, defaultOutput: "documents" });
}
function hybridSearch(inputs, options) {
  return createNode("vector.HybridSearch", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances", "scores"], outputTypes: { "ids": "list[str]", "documents": "list[str]", "metadatas": "list[dict]", "distances": "list[float]", "scores": "list[float]" } });
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
