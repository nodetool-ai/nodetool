/**
 * The `google` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `google.ts`, so nothing the
 * implementations pull in reaches the entry graph. `google.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const str = (params: Record<string, unknown>, key: string): string => {
  const value = params[key];
  return isString(value) ? value.trim() : "";
};

export const DRIVE_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search phrase or Drive query" },
    max_results: {
      type: "integer",
      description: "Maximum files to return (1-100)",
      default: 20
    }
  },
  required: ["query"]
};

export const DRIVE_FILE_ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    file_id: { type: "string", description: "Drive file id" }
  },
  required: ["file_id"]
};

export const DRIVE_CREATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "File name" },
    content: { type: "string", description: "File contents" },
    mime_type: {
      type: "string",
      description: "MIME type (default text/plain)"
    },
    folder_id: {
      type: "string",
      description: "Parent folder id (default: My Drive root)"
    }
  },
  required: ["name", "content"]
};

export const GMAIL_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Gmail search query" },
    max_results: {
      type: "integer",
      description: "Maximum messages to return (1-50)",
      default: 10
    }
  },
  required: ["query"]
};

export const GMAIL_MESSAGE_ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    message_id: { type: "string", description: "Gmail message id" }
  },
  required: ["message_id"]
};

export const GMAIL_SEND_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    to: {
      type: "string",
      description: "Recipient address(es), comma-separated"
    },
    subject: { type: "string", description: "Subject line" },
    body: { type: "string", description: "Plain-text body" },
    cc: { type: "string", description: "Cc address(es), comma-separated" },
    bcc: { type: "string", description: "Bcc address(es), comma-separated" }
  },
  required: ["to", "subject", "body"]
};

export const GMAIL_MODIFY_LABELS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    message_id: { type: "string", description: "Gmail message id" },
    add_label_ids: {
      type: "array",
      items: { type: "string" },
      description: "Label ids to add"
    },
    remove_label_ids: {
      type: "array",
      items: { type: "string" },
      description: "Label ids to remove"
    }
  },
  required: ["message_id"]
};

export const DOCS_READ_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Google Docs document id" }
  },
  required: ["document_id"]
};

export const DOCS_CREATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Document title" },
    text: { type: "string", description: "Initial body text" }
  },
  required: ["title"]
};

export const DOCS_APPEND_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Google Docs document id" },
    text: { type: "string", description: "Text to append" }
  },
  required: ["document_id", "text"]
};

export const SHEETS_READ_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    spreadsheet_id: { type: "string", description: "Spreadsheet id" },
    range: { type: "string", description: "A1 range, e.g. Sheet1!A1:D50" }
  },
  required: ["spreadsheet_id", "range"]
};

export const SHEETS_APPEND_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    spreadsheet_id: { type: "string", description: "Spreadsheet id" },
    range: {
      type: "string",
      description: "A1 range identifying the table, e.g. Sheet1!A:D"
    },
    values: {
      type: "array",
      items: { type: "array", items: {} },
      description: "Rows to append, each an array of cell values"
    }
  },
  required: ["spreadsheet_id", "range", "values"]
};

export const SHEETS_UPDATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    spreadsheet_id: { type: "string", description: "Spreadsheet id" },
    range: { type: "string", description: "A1 range to overwrite" },
    values: {
      type: "array",
      items: { type: "array", items: {} },
      description: "Rows of cell values"
    }
  },
  required: ["spreadsheet_id", "range", "values"]
};

export const SHEETS_CREATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Spreadsheet title" },
    values: {
      type: "array",
      items: { type: "array", items: {} },
      description: "Initial rows, written starting at A1"
    }
  },
  required: ["title"]
};

export const CALENDAR_LIST_EVENTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    calendar_id: {
      type: "string",
      description: "Calendar id (default: primary)"
    },
    time_min: { type: "string", description: "RFC3339 window start" },
    time_max: { type: "string", description: "RFC3339 window end" },
    query: { type: "string", description: "Free-text event filter" },
    max_results: {
      type: "integer",
      description: "Maximum events to return (1-250)",
      default: 20
    }
  }
};

export const CALENDAR_CREATE_EVENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Event title" },
    start: { type: "string", description: "RFC3339 start time" },
    end: { type: "string", description: "RFC3339 end time" },
    calendar_id: {
      type: "string",
      description: "Calendar id (default: primary)"
    },
    description: { type: "string", description: "Event description" },
    location: { type: "string", description: "Event location" },
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Attendee email addresses"
    }
  },
  required: ["summary", "start", "end"]
};

export const CALENDAR_DELETE_EVENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    event_id: { type: "string", description: "Event id" },
    calendar_id: {
      type: "string",
      description: "Calendar id (default: primary)"
    }
  },
  required: ["event_id"]
};

export const driveSearchSpec: CapabilitySpec = {
  name: "google_drive_search",
  description:
    "Search the user's Google Drive. Accepts a plain phrase (full-text " +
    "search) or Drive query syntax such as \"mimeType = 'application/vnd.google-apps.spreadsheet'\".",
  inputSchema: DRIVE_SEARCH_SCHEMA,
  category: "external",
  userMessage: (params) => `Searching Drive for "${str(params, "query")}"`
};

export const driveReadFileCapabilitySpec: CapabilitySpec = {
  name: "google_drive_read_file",
  description:
    "Read a Google Drive file as text. Google Docs, Sheets and Slides are " +
    "exported to plain text/CSV; other files are downloaded as-is.",
  inputSchema: DRIVE_FILE_ID_SCHEMA,
  category: "external",
  userMessage: () => "Reading a Drive file"
};

export const driveGetFileCapabilitySpec: CapabilitySpec = {
  name: "google_drive_get_file",
  description:
    "Get metadata (name, mime type, size, owners, link) for a Drive file.",
  inputSchema: DRIVE_FILE_ID_SCHEMA,
  category: "external",
  userMessage: () => "Fetching Drive file details"
};

export const driveCreateFileCapabilitySpec: CapabilitySpec = {
  name: "google_drive_create_file",
  description: "Create a text file in the user's Google Drive.",
  inputSchema: DRIVE_CREATE_SCHEMA,
  category: "external",
  userMessage: (params) => `Creating "${str(params, "name")}" in Drive`
};

export const gmailSearchSpec: CapabilitySpec = {
  name: "gmail_search",
  description:
    "Search the user's Gmail with Gmail query syntax (e.g. " +
    "'from:alice@example.com is:unread newer_than:7d'). Returns parsed " +
    "messages with subject, sender, date and body.",
  inputSchema: GMAIL_SEARCH_SCHEMA,
  category: "external",
  userMessage: (params) => `Searching Gmail for "${str(params, "query")}"`
};

export const gmailGetMessageCapabilitySpec: CapabilitySpec = {
  name: "gmail_get_message",
  description: "Fetch one Gmail message by id, fully parsed.",
  inputSchema: GMAIL_MESSAGE_ID_SCHEMA,
  category: "external",
  userMessage: () => "Reading an email"
};

export const gmailSendMessageCapabilitySpec: CapabilitySpec = {
  name: "gmail_send_message",
  description: "Send a plain-text email from the user's Gmail account.",
  inputSchema: GMAIL_SEND_SCHEMA,
  category: "external",
  userMessage: (params) => `Sending an email to ${str(params, "to")}`
};

export const gmailModifyLabelsCapabilitySpec: CapabilitySpec = {
  name: "gmail_modify_labels",
  description:
    "Add or remove Gmail labels on a message. Archive by removing 'INBOX'; " +
    "mark read by removing 'UNREAD'.",
  inputSchema: GMAIL_MODIFY_LABELS_SCHEMA,
  category: "external",
  userMessage: () => "Updating email labels"
};

export const gmailListLabelsCapabilitySpec: CapabilitySpec = {
  name: "gmail_list_labels",
  description:
    "List the Gmail labels available in the user's mailbox (id and name).",
  inputSchema: { type: "object", properties: {} },
  category: "external",
  userMessage: () => "Listing Gmail labels"
};

export const docsReadSpec: CapabilitySpec = {
  name: "google_docs_read",
  description: "Read a Google Doc's title and full text.",
  inputSchema: DOCS_READ_SCHEMA,
  category: "external",
  userMessage: () => "Reading a Google Doc"
};

export const docsCreateSpec: CapabilitySpec = {
  name: "google_docs_create",
  description:
    "Create a Google Doc, optionally seeded with text. Returns its id and URL.",
  inputSchema: DOCS_CREATE_SCHEMA,
  category: "external",
  userMessage: (params) => `Creating the doc "${str(params, "title")}"`
};

export const docsAppendSpec: CapabilitySpec = {
  name: "google_docs_append",
  description: "Append text to the end of a Google Doc.",
  inputSchema: DOCS_APPEND_SCHEMA,
  category: "external",
  userMessage: () => "Appending to a Google Doc"
};

export const sheetsReadSpec: CapabilitySpec = {
  name: "google_sheets_read",
  description:
    "Read a range from a Google Sheet in A1 notation (e.g. 'Sheet1!A1:D50'). " +
    "Returns rows of cell values.",
  inputSchema: SHEETS_READ_SCHEMA,
  category: "external",
  userMessage: (params) => `Reading ${str(params, "range")} from a Google Sheet`
};

export const sheetsAppendSpec: CapabilitySpec = {
  name: "google_sheets_append",
  description:
    "Append rows below the last populated row of a Google Sheet range.",
  inputSchema: SHEETS_APPEND_SCHEMA,
  category: "external",
  userMessage: () => "Appending rows to a Google Sheet"
};

export const sheetsUpdateSpec: CapabilitySpec = {
  name: "google_sheets_update",
  description: "Overwrite a Google Sheet range with new values.",
  inputSchema: SHEETS_UPDATE_SCHEMA,
  category: "external",
  userMessage: (params) => `Updating ${str(params, "range")} in a Google Sheet`
};

export const sheetsCreateSpec: CapabilitySpec = {
  name: "google_sheets_create",
  description:
    "Create a Google Sheet, optionally seeded with rows. Returns id and URL.",
  inputSchema: SHEETS_CREATE_SCHEMA,
  category: "external",
  userMessage: (params) => `Creating the sheet "${str(params, "title")}"`
};

export const calendarListSpec: CapabilitySpec = {
  name: "google_calendar_list_calendars",
  description: "List the user's Google calendars (id and name).",
  inputSchema: { type: "object", properties: {} },
  category: "external",
  userMessage: () => "Listing Google calendars"
};

export const calendarEventsSpec: CapabilitySpec = {
  name: "google_calendar_list_events",
  description:
    "List Google Calendar events in a time window, soonest first. Times are " +
    "RFC3339 timestamps; `time_min` defaults to now.",
  inputSchema: CALENDAR_LIST_EVENTS_SCHEMA,
  category: "external",
  userMessage: () => "Checking the calendar"
};

export const calendarCreateSpec: CapabilitySpec = {
  name: "google_calendar_create_event",
  description:
    "Create a Google Calendar event. `start` and `end` are RFC3339 timestamps " +
    "with an offset, e.g. '2026-07-27T15:00:00-07:00'.",
  inputSchema: CALENDAR_CREATE_EVENT_SCHEMA,
  category: "external",
  userMessage: (params) => `Creating the event "${str(params, "summary")}"`
};

export const calendarDeleteSpec: CapabilitySpec = {
  name: "google_calendar_delete_event",
  description: "Delete a Google Calendar event by id.",
  inputSchema: CALENDAR_DELETE_EVENT_SCHEMA,
  category: "external",
  userMessage: () => "Deleting a calendar event"
};

/** Every spec this module declares, in declaration order. */
export const googleSpecs: readonly CapabilitySpec[] = [
  driveSearchSpec,
  driveReadFileCapabilitySpec,
  driveGetFileCapabilitySpec,
  driveCreateFileCapabilitySpec,
  gmailSearchSpec,
  gmailGetMessageCapabilitySpec,
  gmailSendMessageCapabilitySpec,
  gmailModifyLabelsCapabilitySpec,
  gmailListLabelsCapabilitySpec,
  docsReadSpec,
  docsCreateSpec,
  docsAppendSpec,
  sheetsReadSpec,
  sheetsAppendSpec,
  sheetsUpdateSpec,
  sheetsCreateSpec,
  calendarListSpec,
  calendarEventsSpec,
  calendarCreateSpec,
  calendarDeleteSpec
];
