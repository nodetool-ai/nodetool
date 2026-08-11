// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Create Calendar Event — lib.apple.CreateCalendarEvent
export type CreateCalendarEventInputs = {
  event_title?: Connectable<string>;
  start_date?: Connectable<unknown>;
  end_date?: Connectable<unknown>;
  calendar_name?: Connectable<string>;
  location?: Connectable<string>;
  description_text?: Connectable<string>;
};

export interface CreateCalendarEventOutputs {
  output: boolean;
}

export function createCalendarEvent(inputs: CreateCalendarEventInputs): DslNode<CreateCalendarEventOutputs, "output"> {
  return createNode("lib.apple.CreateCalendarEvent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// List Calendar Events — lib.apple.ListCalendarEvents
export type ListCalendarEventsInputs = {
  days_back?: Connectable<number>;
  days_forward?: Connectable<number>;
  calendar_name?: Connectable<string>;
};

export interface ListCalendarEventsOutputs {
  events: unknown[];
}

export function listCalendarEvents(inputs: ListCalendarEventsInputs): DslNode<ListCalendarEventsOutputs, "events"> {
  return createNode("lib.apple.ListCalendarEvents", inputs, { outputNames: ["events"], defaultOutput: "events" });
}

// Create Note — lib.apple.CreateNote
export type CreateNoteInputs = {
  title?: Connectable<string>;
  body?: Connectable<string>;
  folder?: Connectable<string>;
};

export interface CreateNoteOutputs {
  output: boolean;
}

export function createNote(inputs: CreateNoteInputs): DslNode<CreateNoteOutputs, "output"> {
  return createNode("lib.apple.CreateNote", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// List Notes — lib.apple.ListNotes
export type ListNotesInputs = {
  limit?: Connectable<number>;
  folder?: Connectable<string>;
};

export interface ListNotesOutputs {
  notes: unknown[];
}

export function listNotes(inputs: ListNotesInputs): DslNode<ListNotesOutputs, "notes"> {
  return createNode("lib.apple.ListNotes", inputs, { outputNames: ["notes"], defaultOutput: "notes" });
}

// Create Reminder — lib.apple.CreateReminder
export type CreateReminderInputs = {
  title?: Connectable<string>;
  due_date?: Connectable<unknown>;
  list_name?: Connectable<string>;
  notes?: Connectable<string>;
};

export interface CreateReminderOutputs {
  output: boolean;
}

export function createReminder(inputs: CreateReminderInputs): DslNode<CreateReminderOutputs, "output"> {
  return createNode("lib.apple.CreateReminder", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// List Reminders — lib.apple.ListReminders
export type ListRemindersInputs = {
  list_name?: Connectable<string>;
  include_completed?: Connectable<boolean>;
};

export interface ListRemindersOutputs {
  reminders: unknown[];
}

export function listReminders(inputs: ListRemindersInputs): DslNode<ListRemindersOutputs, "reminders"> {
  return createNode("lib.apple.ListReminders", inputs, { outputNames: ["reminders"], defaultOutput: "reminders" });
}

// Send iMessage — lib.apple.SendMessage
export type SendMessageInputs = {
  recipient?: Connectable<string>;
  text?: Connectable<string>;
};

export interface SendMessageOutputs {
  output: boolean;
}

export function sendMessage(inputs: SendMessageInputs): DslNode<SendMessageOutputs, "output"> {
  return createNode("lib.apple.SendMessage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Send Mail (Apple Mail) — lib.apple.SendMail
export type SendMailInputs = {
  to_address?: Connectable<string>;
  cc_address?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
  visible?: Connectable<boolean>;
};

export interface SendMailOutputs {
  output: boolean;
}

export function sendMail(inputs: SendMailInputs): DslNode<SendMailOutputs, "output"> {
  return createNode("lib.apple.SendMail", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Search Contacts — lib.apple.SearchContacts
export type SearchContactsInputs = {
  query?: Connectable<string>;
  limit?: Connectable<number>;
};

export interface SearchContactsOutputs {
  contacts: unknown[];
}

export function searchContacts(inputs: SearchContactsInputs): DslNode<SearchContactsOutputs, "contacts"> {
  return createNode("lib.apple.SearchContacts", inputs, { outputNames: ["contacts"], defaultOutput: "contacts" });
}

// Get Front Safari Tab — lib.apple.GetFrontSafariTab
export type GetFrontSafariTabInputs = {
};

export interface GetFrontSafariTabOutputs {
  url: string;
  title: string;
}

export function getFrontSafariTab(inputs?: GetFrontSafariTabInputs): DslNode<GetFrontSafariTabOutputs> {
  return createNode("lib.apple.GetFrontSafariTab", inputs ?? {}, { outputNames: ["url", "title"] });
}

// Open URL in Safari — lib.apple.OpenSafariURL
export type OpenSafariURLInputs = {
  url?: Connectable<string>;
  activate?: Connectable<boolean>;
};

export interface OpenSafariURLOutputs {
  output: boolean;
}

export function openSafariURL(inputs: OpenSafariURLInputs): DslNode<OpenSafariURLOutputs, "output"> {
  return createNode("lib.apple.OpenSafariURL", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Safari Selection Text — lib.apple.SafariSelectionText
export type SafariSelectionTextInputs = {
};

export interface SafariSelectionTextOutputs {
  output: string;
}

export function safariSelectionText(inputs?: SafariSelectionTextInputs): DslNode<SafariSelectionTextOutputs, "output"> {
  return createNode("lib.apple.SafariSelectionText", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Safari Page Text — lib.apple.SafariPageText
export type SafariPageTextInputs = {
  max_chars?: Connectable<number>;
  prefer_article?: Connectable<boolean>;
};

export interface SafariPageTextOutputs {
  output: string;
}

export function safariPageText(inputs: SafariPageTextInputs): DslNode<SafariPageTextOutputs, "output"> {
  return createNode("lib.apple.SafariPageText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Clipboard Text — lib.apple.GetClipboardText
export type GetClipboardTextInputs = {
};

export interface GetClipboardTextOutputs {
  output: string;
}

export function getClipboardText(inputs?: GetClipboardTextInputs): DslNode<GetClipboardTextOutputs, "output"> {
  return createNode("lib.apple.GetClipboardText", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}

// Set Clipboard Text — lib.apple.SetClipboardText
export type SetClipboardTextInputs = {
  text?: Connectable<string>;
};

export interface SetClipboardTextOutputs {
  output: boolean;
}

export function setClipboardText(inputs: SetClipboardTextInputs): DslNode<SetClipboardTextOutputs, "output"> {
  return createNode("lib.apple.SetClipboardText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Say Text — lib.apple.SayText
export type SayTextInputs = {
  text?: Connectable<string>;
  voice?: Connectable<string>;
  rate?: Connectable<number>;
  wait?: Connectable<boolean>;
};

export interface SayTextOutputs {
  output: boolean;
}

export function sayText(inputs: SayTextInputs): DslNode<SayTextOutputs, "output"> {
  return createNode("lib.apple.SayText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Post Notification — lib.apple.PostNotification
export type PostNotificationInputs = {
  title?: Connectable<string>;
  subtitle?: Connectable<string>;
  message?: Connectable<string>;
  sound_name?: Connectable<string>;
};

export interface PostNotificationOutputs {
  output: boolean;
}

export function postNotification(inputs: PostNotificationInputs): DslNode<PostNotificationOutputs, "output"> {
  return createNode("lib.apple.PostNotification", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
