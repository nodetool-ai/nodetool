// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function createCalendarEvent(inputs) {
  return createNode("lib.apple.CreateCalendarEvent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function listCalendarEvents(inputs) {
  return createNode("lib.apple.ListCalendarEvents", inputs, { outputNames: ["events"], defaultOutput: "events" });
}
function createNote(inputs) {
  return createNode("lib.apple.CreateNote", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function listNotes(inputs) {
  return createNode("lib.apple.ListNotes", inputs, { outputNames: ["notes"], defaultOutput: "notes" });
}
function createReminder(inputs) {
  return createNode("lib.apple.CreateReminder", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function listReminders(inputs) {
  return createNode("lib.apple.ListReminders", inputs, { outputNames: ["reminders"], defaultOutput: "reminders" });
}
function sendMessage(inputs) {
  return createNode("lib.apple.SendMessage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sendMail(inputs) {
  return createNode("lib.apple.SendMail", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function searchContacts(inputs) {
  return createNode("lib.apple.SearchContacts", inputs, { outputNames: ["contacts"], defaultOutput: "contacts" });
}
function getFrontSafariTab(inputs) {
  return createNode("lib.apple.GetFrontSafariTab", inputs ?? {}, { outputNames: ["url", "title"] });
}
function openSafariURL(inputs) {
  return createNode("lib.apple.OpenSafariURL", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function safariSelectionText(inputs) {
  return createNode("lib.apple.SafariSelectionText", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function safariPageText(inputs) {
  return createNode("lib.apple.SafariPageText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getClipboardText(inputs) {
  return createNode("lib.apple.GetClipboardText", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function setClipboardText(inputs) {
  return createNode("lib.apple.SetClipboardText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sayText(inputs) {
  return createNode("lib.apple.SayText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function postNotification(inputs) {
  return createNode("lib.apple.PostNotification", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
