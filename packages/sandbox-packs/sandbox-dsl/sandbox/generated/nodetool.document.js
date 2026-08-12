// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadDocumentFile(inputs) {
  return createNode("nodetool.document.LoadDocumentFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveDocumentFile(inputs) {
  return createNode("nodetool.document.SaveDocumentFile", inputs, { outputNames: [] });
}
function listDocuments(inputs) {
  return createNode("nodetool.document.ListDocuments", inputs, { outputNames: ["document", "documents"], streaming: true });
}
export {
  listDocuments,
  loadDocumentFile,
  saveDocumentFile
};
