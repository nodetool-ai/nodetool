// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function gmailSearch(inputs, options) {
  return createNode("lib.mail.GmailSearch", inputs, { id: options?.id, outputNames: ["email", "message_id", "subject", "sender", "date", "body", "emails", "message_ids"], outputTypes: { "email": "dict", "message_id": "str", "subject": "str", "sender": "str", "date": "str", "body": "str", "emails": "list", "message_ids": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "email": { "kind": "iteration", "source": "__execution__", "group": "items" }, "message_id": { "kind": "iteration", "source": "__execution__", "group": "items" }, "subject": { "kind": "iteration", "source": "__execution__", "group": "items" }, "sender": { "kind": "iteration", "source": "__execution__", "group": "items" }, "date": { "kind": "iteration", "source": "__execution__", "group": "items" }, "body": { "kind": "iteration", "source": "__execution__", "group": "items" }, "emails": { "kind": "single", "source": "__execution__" }, "message_ids": { "kind": "single", "source": "__execution__" } } });
}
function addLabel(inputs, options) {
  return createNode("lib.mail.AddLabel", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "bool" }, defaultOutput: "output" });
}
function moveToArchive(inputs, options) {
  return createNode("lib.mail.MoveToArchive", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "bool" }, defaultOutput: "output" });
}
export {
  addLabel,
  gmailSearch,
  moveToArchive
};
