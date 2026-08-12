// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function gmailSearch(inputs) {
  return createNode("lib.mail.GmailSearch", inputs, { outputNames: ["email", "message_id", "subject", "sender", "date", "body", "emails", "message_ids"], streaming: true });
}
function addLabel(inputs) {
  return createNode("lib.mail.AddLabel", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function moveToArchive(inputs) {
  return createNode("lib.mail.MoveToArchive", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  addLabel,
  gmailSearch,
  moveToArchive
};
