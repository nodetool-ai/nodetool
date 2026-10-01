// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadDocumentFile(inputs, options) {
  return createNode("nodetool.document.LoadDocumentFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "document" }, defaultOutput: "output" });
}
function saveDocumentFile(inputs, options) {
  return createNode("nodetool.document.SaveDocumentFile", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
function listDocuments(inputs, options) {
  return createNode("nodetool.document.ListDocuments", inputs, { id: options?.id, outputNames: ["document", "documents"], outputTypes: { "document": "document", "documents": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "document": { "kind": "iteration", "source": "__execution__", "group": "items" }, "documents": { "kind": "single", "source": "__execution__" } } });
}
export {
  listDocuments,
  loadDocumentFile,
  saveDocumentFile
};
