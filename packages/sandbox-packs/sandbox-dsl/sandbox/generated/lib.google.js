// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function driveSearch(inputs) {
  return createNode("lib.google.DriveSearch", inputs, { outputNames: ["output", "outputs"], streaming: true });
}
function driveReadFile(inputs) {
  return createNode("lib.google.DriveReadFile", inputs, { outputNames: ["output", "name", "mime_type"] });
}
function driveCreateFile(inputs) {
  return createNode("lib.google.DriveCreateFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gmailSearch(inputs) {
  return createNode("lib.google.GmailSearch", inputs, { outputNames: ["output", "outputs"], streaming: true });
}
function gmailSend(inputs) {
  return createNode("lib.google.GmailSend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gmailModifyLabels(inputs) {
  return createNode("lib.google.GmailModifyLabels", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function docsRead(inputs) {
  return createNode("lib.google.DocsRead", inputs, { outputNames: ["output", "title"] });
}
function docsCreate(inputs) {
  return createNode("lib.google.DocsCreate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function docsAppend(inputs) {
  return createNode("lib.google.DocsAppend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sheetsRead(inputs) {
  return createNode("lib.google.SheetsRead", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sheetsAppend(inputs) {
  return createNode("lib.google.SheetsAppend", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sheetsUpdate(inputs) {
  return createNode("lib.google.SheetsUpdate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function calendarListEvents(inputs) {
  return createNode("lib.google.CalendarListEvents", inputs, { outputNames: ["output", "outputs"], streaming: true });
}
function calendarCreateEvent(inputs) {
  return createNode("lib.google.CalendarCreateEvent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  calendarCreateEvent,
  calendarListEvents,
  docsAppend,
  docsCreate,
  docsRead,
  driveCreateFile,
  driveReadFile,
  driveSearch,
  gmailModifyLabels,
  gmailSearch,
  gmailSend,
  sheetsAppend,
  sheetsRead,
  sheetsUpdate
};
