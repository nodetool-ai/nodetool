// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Create Calendar Event — lib.apple.CreateCalendarEvent
export type CreateCalendarEventInputs = {
  event_title?: string;
  start_date?: unknown;
  end_date?: unknown;
  calendar_name?: string;
  location?: string;
  description_text?: string;
};

export interface CreateCalendarEventOutputs {
  output: boolean;
}

export function createCalendarEvent(inputs: CreateCalendarEventInputs): Promise<CreateCalendarEventOutputs> {
  return callNode<CreateCalendarEventOutputs>("lib.apple.CreateCalendarEvent", inputs);
}

// List Calendar Events — lib.apple.ListCalendarEvents
export type ListCalendarEventsInputs = {
  days_back?: number;
  days_forward?: number;
  calendar_name?: string;
};

export interface ListCalendarEventsOutputs {
  events: unknown[];
}

export function listCalendarEvents(inputs: ListCalendarEventsInputs): Promise<ListCalendarEventsOutputs> {
  return callNode<ListCalendarEventsOutputs>("lib.apple.ListCalendarEvents", inputs);
}

// Create Note — lib.apple.CreateNote
export type CreateNoteInputs = {
  title?: string;
  body?: string;
  folder?: string;
};

export interface CreateNoteOutputs {
  output: boolean;
}

export function createNote(inputs: CreateNoteInputs): Promise<CreateNoteOutputs> {
  return callNode<CreateNoteOutputs>("lib.apple.CreateNote", inputs);
}

// List Notes — lib.apple.ListNotes
export type ListNotesInputs = {
  limit?: number;
  folder?: string;
};

export interface ListNotesOutputs {
  notes: unknown[];
}

export function listNotes(inputs: ListNotesInputs): Promise<ListNotesOutputs> {
  return callNode<ListNotesOutputs>("lib.apple.ListNotes", inputs);
}

// Create Reminder — lib.apple.CreateReminder
export type CreateReminderInputs = {
  title?: string;
  due_date?: unknown;
  list_name?: string;
  notes?: string;
};

export interface CreateReminderOutputs {
  output: boolean;
}

export function createReminder(inputs: CreateReminderInputs): Promise<CreateReminderOutputs> {
  return callNode<CreateReminderOutputs>("lib.apple.CreateReminder", inputs);
}

// List Reminders — lib.apple.ListReminders
export type ListRemindersInputs = {
  list_name?: string;
  include_completed?: boolean;
};

export interface ListRemindersOutputs {
  reminders: unknown[];
}

export function listReminders(inputs: ListRemindersInputs): Promise<ListRemindersOutputs> {
  return callNode<ListRemindersOutputs>("lib.apple.ListReminders", inputs);
}

// Send iMessage — lib.apple.SendMessage
export type SendMessageInputs = {
  recipient?: string;
  text?: string;
};

export interface SendMessageOutputs {
  output: boolean;
}

export function sendMessage(inputs: SendMessageInputs): Promise<SendMessageOutputs> {
  return callNode<SendMessageOutputs>("lib.apple.SendMessage", inputs);
}

// Send Mail (Apple Mail) — lib.apple.SendMail
export type SendMailInputs = {
  to_address?: string;
  cc_address?: string;
  subject?: string;
  body?: string;
  visible?: boolean;
};

export interface SendMailOutputs {
  output: boolean;
}

export function sendMail(inputs: SendMailInputs): Promise<SendMailOutputs> {
  return callNode<SendMailOutputs>("lib.apple.SendMail", inputs);
}

// Search Contacts — lib.apple.SearchContacts
export type SearchContactsInputs = {
  query?: string;
  limit?: number;
};

export interface SearchContactsOutputs {
  contacts: unknown[];
}

export function searchContacts(inputs: SearchContactsInputs): Promise<SearchContactsOutputs> {
  return callNode<SearchContactsOutputs>("lib.apple.SearchContacts", inputs);
}

// Get Front Safari Tab — lib.apple.GetFrontSafariTab
export type GetFrontSafariTabInputs = {
};

export interface GetFrontSafariTabOutputs {
  url: string;
  title: string;
}

export function getFrontSafariTab(inputs?: GetFrontSafariTabInputs): Promise<GetFrontSafariTabOutputs> {
  return callNode<GetFrontSafariTabOutputs>("lib.apple.GetFrontSafariTab", inputs ?? {});
}

// Open URL in Safari — lib.apple.OpenSafariURL
export type OpenSafariURLInputs = {
  url?: string;
  activate?: boolean;
};

export interface OpenSafariURLOutputs {
  output: boolean;
}

export function openSafariURL(inputs: OpenSafariURLInputs): Promise<OpenSafariURLOutputs> {
  return callNode<OpenSafariURLOutputs>("lib.apple.OpenSafariURL", inputs);
}

// Safari Selection Text — lib.apple.SafariSelectionText
export type SafariSelectionTextInputs = {
};

export interface SafariSelectionTextOutputs {
  output: string;
}

export function safariSelectionText(inputs?: SafariSelectionTextInputs): Promise<SafariSelectionTextOutputs> {
  return callNode<SafariSelectionTextOutputs>("lib.apple.SafariSelectionText", inputs ?? {});
}

// Safari Page Text — lib.apple.SafariPageText
export type SafariPageTextInputs = {
  max_chars?: number;
  prefer_article?: boolean;
};

export interface SafariPageTextOutputs {
  output: string;
}

export function safariPageText(inputs: SafariPageTextInputs): Promise<SafariPageTextOutputs> {
  return callNode<SafariPageTextOutputs>("lib.apple.SafariPageText", inputs);
}

// Get Clipboard Text — lib.apple.GetClipboardText
export type GetClipboardTextInputs = {
};

export interface GetClipboardTextOutputs {
  output: string;
}

export function getClipboardText(inputs?: GetClipboardTextInputs): Promise<GetClipboardTextOutputs> {
  return callNode<GetClipboardTextOutputs>("lib.apple.GetClipboardText", inputs ?? {});
}

// Set Clipboard Text — lib.apple.SetClipboardText
export type SetClipboardTextInputs = {
  text?: string;
};

export interface SetClipboardTextOutputs {
  output: boolean;
}

export function setClipboardText(inputs: SetClipboardTextInputs): Promise<SetClipboardTextOutputs> {
  return callNode<SetClipboardTextOutputs>("lib.apple.SetClipboardText", inputs);
}

// Say Text — lib.apple.SayText
export type SayTextInputs = {
  text?: string;
  voice?: string;
  rate?: number;
  wait?: boolean;
};

export interface SayTextOutputs {
  output: boolean;
}

export function sayText(inputs: SayTextInputs): Promise<SayTextOutputs> {
  return callNode<SayTextOutputs>("lib.apple.SayText", inputs);
}

// Post Notification — lib.apple.PostNotification
export type PostNotificationInputs = {
  title?: string;
  subtitle?: string;
  message?: string;
  sound_name?: string;
};

export interface PostNotificationOutputs {
  output: boolean;
}

export function postNotification(inputs: PostNotificationInputs): Promise<PostNotificationOutputs> {
  return callNode<PostNotificationOutputs>("lib.apple.PostNotification", inputs);
}
