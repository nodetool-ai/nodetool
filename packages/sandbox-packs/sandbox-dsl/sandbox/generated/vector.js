// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function collection(inputs) {
  return createNode("vector.Collection", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function count(inputs) {
  return createNode("vector.Count", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getDocuments(inputs) {
  return createNode("vector.GetDocuments", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function peek(inputs) {
  return createNode("vector.Peek", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function indexImage(inputs) {
  return createNode("vector.IndexImage", inputs, { outputNames: [] });
}
function indexEmbedding(inputs) {
  return createNode("vector.IndexEmbedding", inputs, { outputNames: [] });
}
function indexTextChunk(inputs) {
  return createNode("vector.IndexTextChunk", inputs, { outputNames: [] });
}
function indexAggregatedText(inputs) {
  return createNode("vector.IndexAggregatedText", inputs, { outputNames: [] });
}
function indexString(inputs) {
  return createNode("vector.IndexString", inputs, { outputNames: [] });
}
function queryImage(inputs) {
  return createNode("vector.QueryImage", inputs, { outputNames: ["ids", "documents", "metadatas", "distances"] });
}
function queryText(inputs) {
  return createNode("vector.QueryText", inputs, { outputNames: ["ids", "documents", "metadatas", "distances"] });
}
function removeOverlap(inputs) {
  return createNode("vector.RemoveOverlap", inputs, { outputNames: ["documents"], defaultOutput: "documents" });
}
function hybridSearch(inputs) {
  return createNode("vector.HybridSearch", inputs, { outputNames: ["ids", "documents", "metadatas", "distances", "scores"] });
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
