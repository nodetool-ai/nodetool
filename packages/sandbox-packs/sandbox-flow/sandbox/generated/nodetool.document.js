// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function loadDocumentFile(inputs) {
  return callNode("nodetool.document.LoadDocumentFile", inputs);
}
function saveDocument(inputs) {
  return callNode("nodetool.document.SaveDocument", inputs);
}
function listDocuments(inputs) {
  return callNode("nodetool.document.ListDocuments", inputs);
}
listDocuments.stream = function(inputs) {
  return streamNode("nodetool.document.ListDocuments", inputs);
};
export {
  listDocuments,
  loadDocumentFile,
  saveDocument
};
