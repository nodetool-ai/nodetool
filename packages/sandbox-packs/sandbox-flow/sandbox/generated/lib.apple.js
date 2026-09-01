// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function createCalendarEvent(inputs) {
  return callNode("lib.apple.CreateCalendarEvent", inputs);
}
function listCalendarEvents(inputs) {
  return callNode("lib.apple.ListCalendarEvents", inputs);
}
function createNote(inputs) {
  return callNode("lib.apple.CreateNote", inputs);
}
function listNotes(inputs) {
  return callNode("lib.apple.ListNotes", inputs);
}
function createReminder(inputs) {
  return callNode("lib.apple.CreateReminder", inputs);
}
function listReminders(inputs) {
  return callNode("lib.apple.ListReminders", inputs);
}
function sendMessage(inputs) {
  return callNode("lib.apple.SendMessage", inputs);
}
function sendMail(inputs) {
  return callNode("lib.apple.SendMail", inputs);
}
function searchContacts(inputs) {
  return callNode("lib.apple.SearchContacts", inputs);
}
function getFrontSafariTab(inputs) {
  return callNode("lib.apple.GetFrontSafariTab", inputs ?? {});
}
function openSafariURL(inputs) {
  return callNode("lib.apple.OpenSafariURL", inputs);
}
function safariSelectionText(inputs) {
  return callNode("lib.apple.SafariSelectionText", inputs ?? {});
}
function safariPageText(inputs) {
  return callNode("lib.apple.SafariPageText", inputs);
}
function getClipboardText(inputs) {
  return callNode("lib.apple.GetClipboardText", inputs ?? {});
}
function setClipboardText(inputs) {
  return callNode("lib.apple.SetClipboardText", inputs);
}
function sayText(inputs) {
  return callNode("lib.apple.SayText", inputs);
}
function postNotification(inputs) {
  return callNode("lib.apple.PostNotification", inputs);
}
export {
  createCalendarEvent,
  createNote,
  createReminder,
  getClipboardText,
  getFrontSafariTab,
  listCalendarEvents,
  listNotes,
  listReminders,
  openSafariURL,
  postNotification,
  safariPageText,
  safariSelectionText,
  sayText,
  searchContacts,
  sendMail,
  sendMessage,
  setClipboardText
};
