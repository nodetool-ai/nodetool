// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function driveSearch(inputs) {
  return callNode("lib.google.DriveSearch", inputs);
}
driveSearch.stream = function(inputs) {
  return streamNode("lib.google.DriveSearch", inputs);
};
function driveReadFile(inputs) {
  return callNode("lib.google.DriveReadFile", inputs);
}
function driveCreateFile(inputs) {
  return callNode("lib.google.DriveCreateFile", inputs);
}
function gmailSearch(inputs) {
  return callNode("lib.google.GmailSearch", inputs);
}
gmailSearch.stream = function(inputs) {
  return streamNode("lib.google.GmailSearch", inputs);
};
function gmailSend(inputs) {
  return callNode("lib.google.GmailSend", inputs);
}
function gmailModifyLabels(inputs) {
  return callNode("lib.google.GmailModifyLabels", inputs);
}
function docsRead(inputs) {
  return callNode("lib.google.DocsRead", inputs);
}
function docsCreate(inputs) {
  return callNode("lib.google.DocsCreate", inputs);
}
function docsAppend(inputs) {
  return callNode("lib.google.DocsAppend", inputs);
}
function sheetsRead(inputs) {
  return callNode("lib.google.SheetsRead", inputs);
}
function sheetsAppend(inputs) {
  return callNode("lib.google.SheetsAppend", inputs);
}
function sheetsUpdate(inputs) {
  return callNode("lib.google.SheetsUpdate", inputs);
}
function calendarListEvents(inputs) {
  return callNode("lib.google.CalendarListEvents", inputs);
}
calendarListEvents.stream = function(inputs) {
  return streamNode("lib.google.CalendarListEvents", inputs);
};
function calendarCreateEvent(inputs) {
  return callNode("lib.google.CalendarCreateEvent", inputs);
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
