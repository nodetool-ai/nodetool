/**
 * Google Workspace agent tools — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * These authenticate with the access token from the user's Google sign-in
 * (resolved through `getSecret("GOOGLE_ACCESS_TOKEN")`), so there is no API key
 * to configure. They are only offered when the server runs in Supabase auth
 * mode — see `isGoogleWorkspaceEnabled()` in `@nodetool-ai/config`.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
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
import { Tool } from "./base-tool.js";
import { registerTool } from "./tool-registry.js";

/**
 * Shared plumbing: resolve the token, run the call, and turn a failure into a
 * `{ error }` result rather than a thrown exception, so the agent can recover
 * (re-authenticate, pick another file) instead of aborting the step.
 */
abstract class GoogleWorkspaceTool extends Tool {
  protected abstract run(
    token: string,
    params: Record<string, unknown>
  ): Promise<unknown>;

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const token = await requireGoogleAccessToken(context);
      return await this.run(token, params);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
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

export class GoogleDriveSearchTool extends GoogleWorkspaceTool {
  readonly name = "google_drive_search";
  readonly description =
    "Search the user's Google Drive. Accepts a plain phrase (full-text " +
    "search) or Drive query syntax such as \"mimeType = 'application/vnd.google-apps.spreadsheet'\".";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Searching Drive for "${str(params, "query")}"`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    const files = await driveSearchFiles(token, {
      q: str(params, "query"),
      maxResults: num(params, "max_results", 20)
    });
    return { files };
  }
}

export class GoogleDriveReadFileTool extends GoogleWorkspaceTool {
  readonly name = "google_drive_read_file";
  readonly description =
    "Read a Google Drive file as text. Google Docs, Sheets and Slides are " +
    "exported to plain text/CSV; other files are downloaded as-is.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      file_id: { type: "string", description: "Drive file id" }
    },
    required: ["file_id"]
  };

  userMessage(): string {
    return "Reading a Drive file";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return driveReadFile(token, str(params, "file_id"));
  }
}

export class GoogleDriveGetFileTool extends GoogleWorkspaceTool {
  readonly name = "google_drive_get_file";
  readonly description =
    "Get metadata (name, mime type, size, owners, link) for a Drive file.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      file_id: { type: "string", description: "Drive file id" }
    },
    required: ["file_id"]
  };

  userMessage(): string {
    return "Fetching Drive file details";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return driveGetFile(token, str(params, "file_id"));
  }
}

export class GoogleDriveCreateFileTool extends GoogleWorkspaceTool {
  readonly name = "google_drive_create_file";
  readonly description = "Create a text file in the user's Google Drive.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Creating "${str(params, "name")}" in Drive`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return driveCreateFile(token, {
      name: str(params, "name"),
      content: str(params, "content"),
      mimeType: str(params, "mime_type") || undefined,
      folderId: str(params, "folder_id") || undefined
    });
  }
}

// ── Gmail ────────────────────────────────────────────────────────────

export class GmailSearchTool extends GoogleWorkspaceTool {
  readonly name = "gmail_search";
  readonly description =
    "Search the user's Gmail with Gmail query syntax (e.g. " +
    "'from:alice@example.com is:unread newer_than:7d'). Returns parsed " +
    "messages with subject, sender, date and body.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Searching Gmail for "${str(params, "query")}"`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    const messages = await gmailSearchMessages(token, {
      q: str(params, "query"),
      maxResults: num(params, "max_results", 10)
    });
    return { messages };
  }
}

export class GmailGetMessageTool extends GoogleWorkspaceTool {
  readonly name = "gmail_get_message";
  readonly description = "Fetch one Gmail message by id, fully parsed.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      message_id: { type: "string", description: "Gmail message id" }
    },
    required: ["message_id"]
  };

  userMessage(): string {
    return "Reading an email";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return gmailGetMessage(token, str(params, "message_id"));
  }
}

export class GmailSendMessageTool extends GoogleWorkspaceTool {
  readonly name = "gmail_send_message";
  readonly description =
    "Send a plain-text email from the user's Gmail account.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      to: { type: "string", description: "Recipient address(es), comma-separated" },
      subject: { type: "string", description: "Subject line" },
      body: { type: "string", description: "Plain-text body" },
      cc: { type: "string", description: "Cc address(es), comma-separated" },
      bcc: { type: "string", description: "Bcc address(es), comma-separated" }
    },
    required: ["to", "subject", "body"]
  };

  userMessage(params: Record<string, unknown>): string {
    return `Sending an email to ${str(params, "to")}`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return gmailSendMessage(token, {
      to: str(params, "to"),
      subject: str(params, "subject"),
      body: str(params, "body"),
      cc: str(params, "cc") || undefined,
      bcc: str(params, "bcc") || undefined
    });
  }
}

export class GmailModifyLabelsTool extends GoogleWorkspaceTool {
  readonly name = "gmail_modify_labels";
  readonly description =
    "Add or remove Gmail labels on a message. Archive by removing 'INBOX'; " +
    "mark read by removing 'UNREAD'.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(): string {
    return "Updating email labels";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return gmailModifyLabels(token, {
      messageId: str(params, "message_id"),
      addLabelIds: strList(params, "add_label_ids"),
      removeLabelIds: strList(params, "remove_label_ids")
    });
  }
}

export class GmailListLabelsTool extends GoogleWorkspaceTool {
  readonly name = "gmail_list_labels";
  readonly description =
    "List the Gmail labels available in the user's mailbox (id and name).";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {}
  };

  userMessage(): string {
    return "Listing Gmail labels";
  }

  protected async run(token: string) {
    return { labels: await gmailListLabels(token) };
  }
}

// ── Docs ─────────────────────────────────────────────────────────────

export class GoogleDocsReadTool extends GoogleWorkspaceTool {
  readonly name = "google_docs_read";
  readonly description = "Read a Google Doc's title and full text.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      document_id: { type: "string", description: "Google Docs document id" }
    },
    required: ["document_id"]
  };

  userMessage(): string {
    return "Reading a Google Doc";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return docsGetDocument(token, str(params, "document_id"));
  }
}

export class GoogleDocsCreateTool extends GoogleWorkspaceTool {
  readonly name = "google_docs_create";
  readonly description =
    "Create a Google Doc, optionally seeded with text. Returns its id and URL.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Document title" },
      text: { type: "string", description: "Initial body text" }
    },
    required: ["title"]
  };

  userMessage(params: Record<string, unknown>): string {
    return `Creating the doc "${str(params, "title")}"`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return docsCreateDocument(token, {
      title: str(params, "title"),
      text: str(params, "text") || undefined
    });
  }
}

export class GoogleDocsAppendTool extends GoogleWorkspaceTool {
  readonly name = "google_docs_append";
  readonly description = "Append text to the end of a Google Doc.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      document_id: { type: "string", description: "Google Docs document id" },
      text: { type: "string", description: "Text to append" }
    },
    required: ["document_id", "text"]
  };

  userMessage(): string {
    return "Appending to a Google Doc";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    await docsAppendText(token, {
      documentId: str(params, "document_id"),
      text: str(params, "text")
    });
    return { success: true, document_id: str(params, "document_id") };
  }
}

// ── Sheets ───────────────────────────────────────────────────────────

export class GoogleSheetsReadTool extends GoogleWorkspaceTool {
  readonly name = "google_sheets_read";
  readonly description =
    "Read a range from a Google Sheet in A1 notation (e.g. 'Sheet1!A1:D50'). " +
    "Returns rows of cell values.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      spreadsheet_id: { type: "string", description: "Spreadsheet id" },
      range: { type: "string", description: "A1 range, e.g. Sheet1!A1:D50" }
    },
    required: ["spreadsheet_id", "range"]
  };

  userMessage(params: Record<string, unknown>): string {
    return `Reading ${str(params, "range")} from a Google Sheet`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    const values = await sheetsReadRange(token, {
      spreadsheetId: str(params, "spreadsheet_id"),
      range: str(params, "range")
    });
    return { values, row_count: values.length };
  }
}

export class GoogleSheetsAppendTool extends GoogleWorkspaceTool {
  readonly name = "google_sheets_append";
  readonly description =
    "Append rows below the last populated row of a Google Sheet range.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(): string {
    return "Appending rows to a Google Sheet";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return sheetsAppendRows(token, {
      spreadsheetId: str(params, "spreadsheet_id"),
      range: str(params, "range"),
      values: rows(params, "values")
    });
  }
}

export class GoogleSheetsUpdateTool extends GoogleWorkspaceTool {
  readonly name = "google_sheets_update";
  readonly description = "Overwrite a Google Sheet range with new values.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Updating ${str(params, "range")} in a Google Sheet`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return sheetsUpdateRange(token, {
      spreadsheetId: str(params, "spreadsheet_id"),
      range: str(params, "range"),
      values: rows(params, "values")
    });
  }
}

export class GoogleSheetsCreateTool extends GoogleWorkspaceTool {
  readonly name = "google_sheets_create";
  readonly description =
    "Create a Google Sheet, optionally seeded with rows. Returns id and URL.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Creating the sheet "${str(params, "title")}"`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return sheetsCreateSpreadsheet(token, {
      title: str(params, "title"),
      values: rows(params, "values")
    });
  }
}

// ── Calendar ─────────────────────────────────────────────────────────

export class GoogleCalendarListCalendarsTool extends GoogleWorkspaceTool {
  readonly name = "google_calendar_list_calendars";
  readonly description = "List the user's Google calendars (id and name).";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {}
  };

  userMessage(): string {
    return "Listing Google calendars";
  }

  protected async run(token: string) {
    return { calendars: await calendarListCalendars(token) };
  }
}

export class GoogleCalendarListEventsTool extends GoogleWorkspaceTool {
  readonly name = "google_calendar_list_events";
  readonly description =
    "List Google Calendar events in a time window, soonest first. Times are " +
    "RFC3339 timestamps; `time_min` defaults to now.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(): string {
    return "Checking the calendar";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    const events = await calendarListEvents(token, {
      calendarId: str(params, "calendar_id") || undefined,
      timeMin: str(params, "time_min") || undefined,
      timeMax: str(params, "time_max") || undefined,
      q: str(params, "query") || undefined,
      maxResults: num(params, "max_results", 20)
    });
    return { events };
  }
}

export class GoogleCalendarCreateEventTool extends GoogleWorkspaceTool {
  readonly name = "google_calendar_create_event";
  readonly description =
    "Create a Google Calendar event. `start` and `end` are RFC3339 timestamps " +
    "with an offset, e.g. '2026-07-27T15:00:00-07:00'.";
  protected readonly jsonSchema = {
    type: "object" as const,
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

  userMessage(params: Record<string, unknown>): string {
    return `Creating the event "${str(params, "summary")}"`;
  }

  protected async run(token: string, params: Record<string, unknown>) {
    return calendarCreateEvent(token, {
      calendarId: str(params, "calendar_id") || undefined,
      summary: str(params, "summary"),
      start: str(params, "start"),
      end: str(params, "end"),
      description: str(params, "description") || undefined,
      location: str(params, "location") || undefined,
      attendees: strList(params, "attendees")
    });
  }
}

export class GoogleCalendarDeleteEventTool extends GoogleWorkspaceTool {
  readonly name = "google_calendar_delete_event";
  readonly description = "Delete a Google Calendar event by id.";
  protected readonly jsonSchema = {
    type: "object" as const,
    properties: {
      event_id: { type: "string", description: "Event id" },
      calendar_id: {
        type: "string",
        description: "Calendar id (default: primary)"
      }
    },
    required: ["event_id"]
  };

  userMessage(): string {
    return "Deleting a calendar event";
  }

  protected async run(token: string, params: Record<string, unknown>) {
    await calendarDeleteEvent(token, {
      calendarId: str(params, "calendar_id") || undefined,
      eventId: str(params, "event_id")
    });
    return { success: true, event_id: str(params, "event_id") };
  }
}

/**
 * Every Google Workspace tool class. Kept separate from
 * `BUILTIN_TOOL_CLASSES` because they are only offered when the deployment can
 * produce a Google login token.
 */
export const GOOGLE_WORKSPACE_TOOL_CLASSES: ReadonlyArray<new () => Tool> = [
  GoogleDriveSearchTool,
  GoogleDriveGetFileTool,
  GoogleDriveReadFileTool,
  GoogleDriveCreateFileTool,
  GmailSearchTool,
  GmailGetMessageTool,
  GmailSendMessageTool,
  GmailModifyLabelsTool,
  GmailListLabelsTool,
  GoogleDocsReadTool,
  GoogleDocsCreateTool,
  GoogleDocsAppendTool,
  GoogleSheetsReadTool,
  GoogleSheetsAppendTool,
  GoogleSheetsUpdateTool,
  GoogleSheetsCreateTool,
  GoogleCalendarListCalendarsTool,
  GoogleCalendarListEventsTool,
  GoogleCalendarCreateEventTool,
  GoogleCalendarDeleteEventTool
];

/** One fresh instance per Google Workspace tool. */
export function getGoogleWorkspaceTools(): Tool[] {
  return GOOGLE_WORKSPACE_TOOL_CLASSES.map((Cls) => new Cls());
}

let registeredNames: string[] | null = null;

/**
 * Register the Google Workspace tools so `resolveTool(name)` finds them.
 * Idempotent. Callers gate this on `isGoogleWorkspaceEnabled()`.
 */
export function registerGoogleWorkspaceTools(): string[] {
  if (registeredNames) return registeredNames;
  const names: string[] = [];
  for (const tool of getGoogleWorkspaceTools()) {
    registerTool(tool);
    names.push(tool.name);
  }
  registeredNames = names;
  return names;
}
