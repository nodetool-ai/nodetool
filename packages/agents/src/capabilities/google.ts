/**
 * The `google` capability module — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * Twenty capabilities that used to be twenty `GoogleWorkspaceTool` subclasses
 * in `../tools/google-workspace-tools.ts`. That base class contributed one
 * thing beyond the surface: resolve the user's Google access token, run the
 * call, and return a failure as `{error}` rather than throwing, so an agent can
 * re-authenticate or pick another file instead of aborting the step. That is
 * {@link googleCall} here, and every implementation is its body.
 *
 * All twenty are `external`: none is listed in `TOOL_PERMISSION_CATEGORIES`, so
 * the map's conservative default classes them that way, and a third-party side
 * effect is what they are. Carried over unchanged — a reclassification belongs
 * in its own diff.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import {
  requireGoogleAccessToken,
  driveSearchFiles,
  driveGetFile,
  driveReadFile,
  driveCreateFile,
  gmailSearchMessages,
  gmailGetMessage,
  gmailSendMessage,
  gmailModifyLabels,
  gmailListLabels,
  docsGetDocument,
  docsCreateDocument,
  docsAppendText,
  sheetsReadRange,
  sheetsAppendRows,
  sheetsUpdateRange,
  sheetsCreateSpreadsheet,
  calendarListCalendars,
  calendarListEvents,
  calendarCreateEvent,
  calendarDeleteEvent
} from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "./invoke.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";

/**
 * Shared plumbing: resolve the token, run the call, and turn a failure into a
 * `{ error }` result rather than a thrown exception, so the agent can recover
 * (re-authenticate, pick another file) instead of aborting the step.
 */
async function googleCall(
  run: CapabilityRun,
  call: (token: string) => Promise<unknown>
): Promise<unknown> {
  try {
    const token = await requireGoogleAccessToken(run.context);
    return await call(token);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A run over one call's context. The Google capabilities need nothing else —
 * the token comes off the context, as it did in the class.
 */
export function googleCapabilityRun(context: ProcessingContext): CapabilityRun {
  return createCapabilityRun({ context, gate: UNGATED });
}

const str = (params: Record<string, unknown>, key: string): string => {
  const value = params[key];
  return typeof value === "string" ? value.trim() : "";
};

const num = (
  params: Record<string, unknown>,
  key: string,
  fallback: number
): number => {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const rows = (params: Record<string, unknown>, key: string): unknown[][] => {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row : [row]));
};

const strList = (params: Record<string, unknown>, key: string): string[] => {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
};

// ── Drive ────────────────────────────────────────────────────────────

const DRIVE_SEARCH_SCHEMA: JsonSchema = {
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

const driveSearch: CapabilityExport = {
  spec: {
    name: "google_drive_search",
    description:
      "Search the user's Google Drive. Accepts a plain phrase (full-text " +
      "search) or Drive query syntax such as \"mimeType = 'application/vnd.google-apps.spreadsheet'\".",
    inputSchema: DRIVE_SEARCH_SCHEMA,
    category: "external",
    userMessage: (params) => `Searching Drive for "${str(params, "query")}"`
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      files: await driveSearchFiles(token, {
        q: str(params, "query"),
        maxResults: num(params, "max_results", 20)
      })
    }))
};

const DRIVE_FILE_ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    file_id: { type: "string", description: "Drive file id" }
  },
  required: ["file_id"]
};

const driveReadFileCapability: CapabilityExport = {
  spec: {
    name: "google_drive_read_file",
    description:
      "Read a Google Drive file as text. Google Docs, Sheets and Slides are " +
      "exported to plain text/CSV; other files are downloaded as-is.",
    inputSchema: DRIVE_FILE_ID_SCHEMA,
    category: "external",
    userMessage: () => "Reading a Drive file"
  },
  impl: async (run, params) =>
    googleCall(run, (token) => driveReadFile(token, str(params, "file_id")))
};

const driveGetFileCapability: CapabilityExport = {
  spec: {
    name: "google_drive_get_file",
    description:
      "Get metadata (name, mime type, size, owners, link) for a Drive file.",
    inputSchema: DRIVE_FILE_ID_SCHEMA,
    category: "external",
    userMessage: () => "Fetching Drive file details"
  },
  impl: async (run, params) =>
    googleCall(run, (token) => driveGetFile(token, str(params, "file_id")))
};

const DRIVE_CREATE_SCHEMA: JsonSchema = {
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

const driveCreateFileCapability: CapabilityExport = {
  spec: {
    name: "google_drive_create_file",
    description: "Create a text file in the user's Google Drive.",
    inputSchema: DRIVE_CREATE_SCHEMA,
    category: "external",
    userMessage: (params) => `Creating "${str(params, "name")}" in Drive`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      driveCreateFile(token, {
        name: str(params, "name"),
        content: str(params, "content"),
        mimeType: str(params, "mime_type") || undefined,
        folderId: str(params, "folder_id") || undefined
      })
    )
};

// ── Gmail ────────────────────────────────────────────────────────────

const GMAIL_SEARCH_SCHEMA: JsonSchema = {
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

const gmailSearch: CapabilityExport = {
  spec: {
    name: "gmail_search",
    description:
      "Search the user's Gmail with Gmail query syntax (e.g. " +
      "'from:alice@example.com is:unread newer_than:7d'). Returns parsed " +
      "messages with subject, sender, date and body.",
    inputSchema: GMAIL_SEARCH_SCHEMA,
    category: "external",
    userMessage: (params) => `Searching Gmail for "${str(params, "query")}"`
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      messages: await gmailSearchMessages(token, {
        q: str(params, "query"),
        maxResults: num(params, "max_results", 10)
      })
    }))
};

const GMAIL_MESSAGE_ID_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    message_id: { type: "string", description: "Gmail message id" }
  },
  required: ["message_id"]
};

const gmailGetMessageCapability: CapabilityExport = {
  spec: {
    name: "gmail_get_message",
    description: "Fetch one Gmail message by id, fully parsed.",
    inputSchema: GMAIL_MESSAGE_ID_SCHEMA,
    category: "external",
    userMessage: () => "Reading an email"
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailGetMessage(token, str(params, "message_id"))
    )
};

const GMAIL_SEND_SCHEMA: JsonSchema = {
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

const gmailSendMessageCapability: CapabilityExport = {
  spec: {
    name: "gmail_send_message",
    description: "Send a plain-text email from the user's Gmail account.",
    inputSchema: GMAIL_SEND_SCHEMA,
    category: "external",
    userMessage: (params) => `Sending an email to ${str(params, "to")}`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailSendMessage(token, {
        to: str(params, "to"),
        subject: str(params, "subject"),
        body: str(params, "body"),
        cc: str(params, "cc") || undefined,
        bcc: str(params, "bcc") || undefined
      })
    )
};

const GMAIL_MODIFY_LABELS_SCHEMA: JsonSchema = {
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

const gmailModifyLabelsCapability: CapabilityExport = {
  spec: {
    name: "gmail_modify_labels",
    description:
      "Add or remove Gmail labels on a message. Archive by removing 'INBOX'; " +
      "mark read by removing 'UNREAD'.",
    inputSchema: GMAIL_MODIFY_LABELS_SCHEMA,
    category: "external",
    userMessage: () => "Updating email labels"
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      gmailModifyLabels(token, {
        messageId: str(params, "message_id"),
        addLabelIds: strList(params, "add_label_ids"),
        removeLabelIds: strList(params, "remove_label_ids")
      })
    )
};

const gmailListLabelsCapability: CapabilityExport = {
  spec: {
    name: "gmail_list_labels",
    description:
      "List the Gmail labels available in the user's mailbox (id and name).",
    inputSchema: { type: "object", properties: {} },
    category: "external",
    userMessage: () => "Listing Gmail labels"
  },
  impl: async (run) =>
    googleCall(run, async (token) => ({
      labels: await gmailListLabels(token)
    }))
};

// ── Docs ─────────────────────────────────────────────────────────────

const DOCS_READ_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Google Docs document id" }
  },
  required: ["document_id"]
};

const docsRead: CapabilityExport = {
  spec: {
    name: "google_docs_read",
    description: "Read a Google Doc's title and full text.",
    inputSchema: DOCS_READ_SCHEMA,
    category: "external",
    userMessage: () => "Reading a Google Doc"
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      docsGetDocument(token, str(params, "document_id"))
    )
};

const DOCS_CREATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Document title" },
    text: { type: "string", description: "Initial body text" }
  },
  required: ["title"]
};

const docsCreate: CapabilityExport = {
  spec: {
    name: "google_docs_create",
    description:
      "Create a Google Doc, optionally seeded with text. Returns its id and URL.",
    inputSchema: DOCS_CREATE_SCHEMA,
    category: "external",
    userMessage: (params) => `Creating the doc "${str(params, "title")}"`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      docsCreateDocument(token, {
        title: str(params, "title"),
        text: str(params, "text") || undefined
      })
    )
};

const DOCS_APPEND_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Google Docs document id" },
    text: { type: "string", description: "Text to append" }
  },
  required: ["document_id", "text"]
};

const docsAppend: CapabilityExport = {
  spec: {
    name: "google_docs_append",
    description: "Append text to the end of a Google Doc.",
    inputSchema: DOCS_APPEND_SCHEMA,
    category: "external",
    userMessage: () => "Appending to a Google Doc"
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      await docsAppendText(token, {
        documentId: str(params, "document_id"),
        text: str(params, "text")
      });
      return { success: true, document_id: str(params, "document_id") };
    })
};

// ── Sheets ───────────────────────────────────────────────────────────

const SHEETS_READ_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    spreadsheet_id: { type: "string", description: "Spreadsheet id" },
    range: { type: "string", description: "A1 range, e.g. Sheet1!A1:D50" }
  },
  required: ["spreadsheet_id", "range"]
};

const sheetsRead: CapabilityExport = {
  spec: {
    name: "google_sheets_read",
    description:
      "Read a range from a Google Sheet in A1 notation (e.g. 'Sheet1!A1:D50'). " +
      "Returns rows of cell values.",
    inputSchema: SHEETS_READ_SCHEMA,
    category: "external",
    userMessage: (params) =>
      `Reading ${str(params, "range")} from a Google Sheet`
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      const values = await sheetsReadRange(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range")
      });
      return { values, row_count: values.length };
    })
};

const SHEETS_APPEND_SCHEMA: JsonSchema = {
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

const sheetsAppend: CapabilityExport = {
  spec: {
    name: "google_sheets_append",
    description:
      "Append rows below the last populated row of a Google Sheet range.",
    inputSchema: SHEETS_APPEND_SCHEMA,
    category: "external",
    userMessage: () => "Appending rows to a Google Sheet"
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsAppendRows(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range"),
        values: rows(params, "values")
      })
    )
};

const SHEETS_UPDATE_SCHEMA: JsonSchema = {
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

const sheetsUpdate: CapabilityExport = {
  spec: {
    name: "google_sheets_update",
    description: "Overwrite a Google Sheet range with new values.",
    inputSchema: SHEETS_UPDATE_SCHEMA,
    category: "external",
    userMessage: (params) => `Updating ${str(params, "range")} in a Google Sheet`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsUpdateRange(token, {
        spreadsheetId: str(params, "spreadsheet_id"),
        range: str(params, "range"),
        values: rows(params, "values")
      })
    )
};

const SHEETS_CREATE_SCHEMA: JsonSchema = {
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

const sheetsCreate: CapabilityExport = {
  spec: {
    name: "google_sheets_create",
    description:
      "Create a Google Sheet, optionally seeded with rows. Returns id and URL.",
    inputSchema: SHEETS_CREATE_SCHEMA,
    category: "external",
    userMessage: (params) => `Creating the sheet "${str(params, "title")}"`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      sheetsCreateSpreadsheet(token, {
        title: str(params, "title"),
        values: rows(params, "values")
      })
    )
};

// ── Calendar ─────────────────────────────────────────────────────────

const calendarList: CapabilityExport = {
  spec: {
    name: "google_calendar_list_calendars",
    description: "List the user's Google calendars (id and name).",
    inputSchema: { type: "object", properties: {} },
    category: "external",
    userMessage: () => "Listing Google calendars"
  },
  impl: async (run) =>
    googleCall(run, async (token) => ({
      calendars: await calendarListCalendars(token)
    }))
};

const CALENDAR_LIST_EVENTS_SCHEMA: JsonSchema = {
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

const calendarEvents: CapabilityExport = {
  spec: {
    name: "google_calendar_list_events",
    description:
      "List Google Calendar events in a time window, soonest first. Times are " +
      "RFC3339 timestamps; `time_min` defaults to now.",
    inputSchema: CALENDAR_LIST_EVENTS_SCHEMA,
    category: "external",
    userMessage: () => "Checking the calendar"
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => ({
      events: await calendarListEvents(token, {
        calendarId: str(params, "calendar_id") || undefined,
        timeMin: str(params, "time_min") || undefined,
        timeMax: str(params, "time_max") || undefined,
        q: str(params, "query") || undefined,
        maxResults: num(params, "max_results", 20)
      })
    }))
};

const CALENDAR_CREATE_EVENT_SCHEMA: JsonSchema = {
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

const calendarCreate: CapabilityExport = {
  spec: {
    name: "google_calendar_create_event",
    description:
      "Create a Google Calendar event. `start` and `end` are RFC3339 timestamps " +
      "with an offset, e.g. '2026-07-27T15:00:00-07:00'.",
    inputSchema: CALENDAR_CREATE_EVENT_SCHEMA,
    category: "external",
    userMessage: (params) => `Creating the event "${str(params, "summary")}"`
  },
  impl: async (run, params) =>
    googleCall(run, (token) =>
      calendarCreateEvent(token, {
        calendarId: str(params, "calendar_id") || undefined,
        summary: str(params, "summary"),
        start: str(params, "start"),
        end: str(params, "end"),
        description: str(params, "description") || undefined,
        location: str(params, "location") || undefined,
        attendees: strList(params, "attendees")
      })
    )
};

const CALENDAR_DELETE_EVENT_SCHEMA: JsonSchema = {
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

const calendarDelete: CapabilityExport = {
  spec: {
    name: "google_calendar_delete_event",
    description: "Delete a Google Calendar event by id.",
    inputSchema: CALENDAR_DELETE_EVENT_SCHEMA,
    category: "external",
    userMessage: () => "Deleting a calendar event"
  },
  impl: async (run, params) =>
    googleCall(run, async (token) => {
      await calendarDeleteEvent(token, {
        calendarId: str(params, "calendar_id") || undefined,
        eventId: str(params, "event_id")
      });
      return { success: true, event_id: str(params, "event_id") };
    })
};

/** Every Google Workspace capability, in the order the classes were listed. */
export const GOOGLE_CAPABILITIES: readonly CapabilityExport[] = [
  driveSearch,
  driveGetFileCapability,
  driveReadFileCapability,
  driveCreateFileCapability,
  gmailSearch,
  gmailGetMessageCapability,
  gmailSendMessageCapability,
  gmailModifyLabelsCapability,
  gmailListLabelsCapability,
  docsRead,
  docsCreate,
  docsAppend,
  sheetsRead,
  sheetsAppend,
  sheetsUpdate,
  sheetsCreate,
  calendarList,
  calendarEvents,
  calendarCreate,
  calendarDelete
];

export const module: CapabilityModule = {
  module: "google",
  exports: GOOGLE_CAPABILITIES
};

export {
  driveSearch,
  driveGetFileCapability,
  driveReadFileCapability,
  driveCreateFileCapability,
  gmailSearch,
  gmailGetMessageCapability,
  gmailSendMessageCapability,
  gmailModifyLabelsCapability,
  gmailListLabelsCapability,
  docsRead,
  docsCreate,
  docsAppend,
  sheetsRead,
  sheetsAppend,
  sheetsUpdate,
  sheetsCreate,
  calendarList,
  calendarEvents,
  calendarCreate,
  calendarDelete
};
