// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function gmailSearch(inputs) {
  return callNode("lib.mail.GmailSearch", inputs);
}
gmailSearch.stream = function(inputs) {
  return streamNode("lib.mail.GmailSearch", inputs);
};
function addLabel(inputs) {
  return callNode("lib.mail.AddLabel", inputs);
}
function moveToArchive(inputs) {
  return callNode("lib.mail.MoveToArchive", inputs);
}
export {
  addLabel,
  gmailSearch,
  moveToArchive
};
