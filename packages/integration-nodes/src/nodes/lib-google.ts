/**
 * Google Workspace nodes — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * These authenticate with the access token from the user's Google sign-in
 * rather than an API key, so they carry no `requiredSettings`. On a server
 * without a login there is no token, and the nodes are filtered out of the
 * palette — see `isGoogleWorkspaceEnabled()` in `@nodetool-ai/config`.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  requireGoogleAccessToken,
  driveSearchFiles,
  driveReadFile,
  driveCreateFile,
  gmailSearchMessages,
  gmailSendMessage,
  gmailModifyLabels,
  docsGetDocument,
  docsCreateDocument,
  docsAppendText,
  sheetsReadRange,
  sheetsAppendRows,
  sheetsUpdateRange,
  calendarListEvents,
  calendarCreateEvent
} from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

/** Correlation shared by every node that emits one item plus the whole list. */
const ITEM_AND_LIST = {
  output: { kind: "iteration", source: "__execution__", group: "items" },
  outputs: { kind: "single", source: "__execution__" }
} satisfies Record<string, OutputCorrelation>;

const str = (value: unknown, fallback = ""): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
};

/** Parse a JSON rows property (`[["a",1],["b",2]]`) into a value matrix. */
function parseRows(value: unknown, label: string): unknown[][] {
  if (Array.isArray(value)) {
    return value.map((row) => (Array.isArray(row) ? row : [row]));
  }
  const raw = str(value);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON for ${label}: ${raw}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array of rows`);
  }
  return parsed.map((row) => (Array.isArray(row) ? row : [row]));
}

/** Split a comma/newline separated list into trimmed entries. */
function splitList(value: unknown): string[] {
  return str(value)
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ── Drive ────────────────────────────────────────────────────────────

export class GoogleDriveSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DriveSearch";
  static readonly title = "Google Drive Search";
  static readonly inlineFields = ["query"];
  static readonly inputFields = [];
  static readonly description =
    "Search files in the signed-in user's Google Drive.\n    google, drive, search, files, cloud";
  static readonly metadataOutputTypes = {
    output: "dict",
    outputs: "list"
  };
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = ITEM_AND_LIST;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description:
      "Search phrase, or Drive query syntax such as \"name contains 'report'\""
  })
  declare query: any;

  @prop({
    type: "int",
    default: 20,
    title: "Max Results",
    description: "Maximum number of files to return"
  })
  declare max_results: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const token = await requireGoogleAccessToken(context);
    const files = await driveSearchFiles(token, {
      q: str(this.query),
      maxResults: Number(this.max_results ?? 20)
    });
    return { output: files[0] ?? null, outputs: files };
  }
}

export class GoogleDriveReadFileLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DriveReadFile";
  static readonly title = "Google Drive Read File";
  static readonly inlineFields = ["file_id"];
  static readonly inputFields = [];
  static readonly description =
    "Read a Drive file as text. Docs, Sheets and Slides are exported to plain text or CSV.\n    google, drive, read, download, file";
  static readonly metadataOutputTypes = {
    output: "str",
    name: "str",
    mime_type: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "File ID",
    description: "Drive file id"
  })
  declare file_id: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const fileId = str(this.file_id);
    if (!fileId) throw new Error("file_id is required");
    const token = await requireGoogleAccessToken(context);
    const file = await driveReadFile(token, fileId);
    return {
      output: file.content,
      name: file.name,
      mime_type: file.mimeType
    };
  }
}

export class GoogleDriveCreateFileLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DriveCreateFile";
  static readonly title = "Google Drive Create File";
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["content"];
  static readonly description =
    "Create a text file in the signed-in user's Google Drive.\n    google, drive, create, upload, file";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "File name"
  })
  declare name: any;

  @prop({
    type: "str",
    default: "",
    title: "Content",
    description: "File contents"
  })
  declare content: any;

  @prop({
    type: "str",
    default: "text/plain",
    title: "MIME Type",
    description: "MIME type of the uploaded content"
  })
  declare mime_type: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder ID",
    description: "Parent folder id (blank for My Drive root)"
  })
  declare folder_id: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const name = str(this.name);
    if (!name) throw new Error("name is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await driveCreateFile(token, {
        name,
        content: str(this.content),
        mimeType: str(this.mime_type, "text/plain"),
        folderId: str(this.folder_id) || undefined
      })
    };
  }
}

// ── Gmail ────────────────────────────────────────────────────────────

export class GoogleGmailSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.google.GmailSearch";
  static readonly title = "Gmail Search";
  static readonly inlineFields = ["query"];
  static readonly inputFields = [];
  static readonly description =
    "Search Gmail with Gmail query syntax and return parsed messages.\n    google, gmail, email, search, inbox";
  static readonly metadataOutputTypes = {
    output: "dict",
    outputs: "list"
  };
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = ITEM_AND_LIST;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Gmail query, e.g. 'from:alice@example.com newer_than:7d'"
  })
  declare query: any;

  @prop({
    type: "int",
    default: 10,
    title: "Max Results",
    description: "Maximum number of messages to return"
  })
  declare max_results: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const token = await requireGoogleAccessToken(context);
    const messages = await gmailSearchMessages(token, {
      q: str(this.query),
      maxResults: Number(this.max_results ?? 10)
    });
    return { output: messages[0] ?? null, outputs: messages };
  }
}

export class GoogleGmailSendLibNode extends BaseNode {
  static readonly nodeType = "lib.google.GmailSend";
  static readonly title = "Gmail Send";
  static readonly inlineFields = ["to", "subject"];
  static readonly inputFields = ["body"];
  static readonly description =
    "Send a plain-text email from the signed-in user's Gmail account.\n    google, gmail, email, send, message";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "To",
    description: "Recipient address(es), comma-separated"
  })
  declare to: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Subject line"
  })
  declare subject: any;

  @prop({
    type: "str",
    default: "",
    title: "Body",
    description: "Plain-text body"
  })
  declare body: any;

  @prop({
    type: "str",
    default: "",
    title: "Cc",
    description: "Cc address(es), comma-separated"
  })
  declare cc: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const to = str(this.to);
    if (!to) throw new Error("to is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await gmailSendMessage(token, {
        to,
        subject: str(this.subject),
        body: str(this.body),
        cc: str(this.cc) || undefined
      })
    };
  }
}

export class GoogleGmailModifyLabelsLibNode extends BaseNode {
  static readonly nodeType = "lib.google.GmailModifyLabels";
  static readonly title = "Gmail Modify Labels";
  static readonly inlineFields = ["message_id"];
  static readonly inputFields = [];
  static readonly description =
    "Add or remove Gmail labels on a message. Archive by removing INBOX.\n    google, gmail, label, archive, organize";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Message ID",
    description: "Gmail message id"
  })
  declare message_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Add Labels",
    description: "Label ids to add, comma-separated"
  })
  declare add_labels: any;

  @prop({
    type: "str",
    default: "",
    title: "Remove Labels",
    description: "Label ids to remove, comma-separated"
  })
  declare remove_labels: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const messageId = str(this.message_id);
    if (!messageId) throw new Error("message_id is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await gmailModifyLabels(token, {
        messageId,
        addLabelIds: splitList(this.add_labels),
        removeLabelIds: splitList(this.remove_labels)
      })
    };
  }
}

// ── Docs ─────────────────────────────────────────────────────────────

export class GoogleDocsReadLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DocsRead";
  static readonly title = "Google Docs Read";
  static readonly inlineFields = ["document_id"];
  static readonly inputFields = [];
  static readonly description =
    "Read a Google Doc's title and full text.\n    google, docs, document, read, text";
  static readonly metadataOutputTypes = {
    output: "str",
    title: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Document ID",
    description: "Google Docs document id"
  })
  declare document_id: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const documentId = str(this.document_id);
    if (!documentId) throw new Error("document_id is required");
    const token = await requireGoogleAccessToken(context);
    const doc = await docsGetDocument(token, documentId);
    return { output: doc.text, title: doc.title };
  }
}

export class GoogleDocsCreateLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DocsCreate";
  static readonly title = "Google Docs Create";
  static readonly inlineFields = ["title"];
  static readonly inputFields = ["text"];
  static readonly description =
    "Create a Google Doc, optionally seeded with text.\n    google, docs, document, create, write";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Document title"
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Initial body text"
  })
  declare text: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const title = str(this.title);
    if (!title) throw new Error("title is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await docsCreateDocument(token, {
        title,
        text: str(this.text) || undefined
      })
    };
  }
}

export class GoogleDocsAppendLibNode extends BaseNode {
  static readonly nodeType = "lib.google.DocsAppend";
  static readonly title = "Google Docs Append";
  static readonly inlineFields = ["document_id"];
  static readonly inputFields = ["text"];
  static readonly description =
    "Append text to the end of a Google Doc.\n    google, docs, document, append, write";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Document ID",
    description: "Google Docs document id"
  })
  declare document_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to append"
  })
  declare text: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const documentId = str(this.document_id);
    if (!documentId) throw new Error("document_id is required");
    const token = await requireGoogleAccessToken(context);
    await docsAppendText(token, { documentId, text: str(this.text) });
    return { output: documentId };
  }
}

// ── Sheets ───────────────────────────────────────────────────────────

export class GoogleSheetsReadLibNode extends BaseNode {
  static readonly nodeType = "lib.google.SheetsRead";
  static readonly title = "Google Sheets Read";
  static readonly inlineFields = ["spreadsheet_id", "range"];
  static readonly inputFields = [];
  static readonly description =
    "Read a range from a Google Sheet as rows of cell values.\n    google, sheets, spreadsheet, read, rows";
  static readonly metadataOutputTypes = {
    output: "list"
  };

  @prop({
    type: "str",
    default: "",
    title: "Spreadsheet ID",
    description: "Google Sheets spreadsheet id"
  })
  declare spreadsheet_id: any;

  @prop({
    type: "str",
    default: "A1:Z1000",
    title: "Range",
    description: "A1 notation range, e.g. Sheet1!A1:D50"
  })
  declare range: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const spreadsheetId = str(this.spreadsheet_id);
    if (!spreadsheetId) throw new Error("spreadsheet_id is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await sheetsReadRange(token, {
        spreadsheetId,
        range: str(this.range, "A1:Z1000")
      })
    };
  }
}

export class GoogleSheetsAppendLibNode extends BaseNode {
  static readonly nodeType = "lib.google.SheetsAppend";
  static readonly title = "Google Sheets Append";
  static readonly inlineFields = ["spreadsheet_id", "range"];
  static readonly inputFields = ["values"];
  static readonly description =
    "Append rows below the last populated row of a Google Sheet range.\n    google, sheets, spreadsheet, append, rows";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Spreadsheet ID",
    description: "Google Sheets spreadsheet id"
  })
  declare spreadsheet_id: any;

  @prop({
    type: "str",
    default: "A:Z",
    title: "Range",
    description: "A1 notation range identifying the table"
  })
  declare range: any;

  @prop({
    type: "str",
    default: "",
    title: "Values",
    description: 'Rows as JSON, e.g. [["Alice", 30], ["Bob", 41]]'
  })
  declare values: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const spreadsheetId = str(this.spreadsheet_id);
    if (!spreadsheetId) throw new Error("spreadsheet_id is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await sheetsAppendRows(token, {
        spreadsheetId,
        range: str(this.range, "A:Z"),
        values: parseRows(this.values, "values")
      })
    };
  }
}

export class GoogleSheetsUpdateLibNode extends BaseNode {
  static readonly nodeType = "lib.google.SheetsUpdate";
  static readonly title = "Google Sheets Update";
  static readonly inlineFields = ["spreadsheet_id", "range"];
  static readonly inputFields = ["values"];
  static readonly description =
    "Overwrite a Google Sheet range with new values.\n    google, sheets, spreadsheet, update, write";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Spreadsheet ID",
    description: "Google Sheets spreadsheet id"
  })
  declare spreadsheet_id: any;

  @prop({
    type: "str",
    default: "A1",
    title: "Range",
    description: "A1 notation range to overwrite"
  })
  declare range: any;

  @prop({
    type: "str",
    default: "",
    title: "Values",
    description: 'Rows as JSON, e.g. [["Alice", 30], ["Bob", 41]]'
  })
  declare values: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const spreadsheetId = str(this.spreadsheet_id);
    if (!spreadsheetId) throw new Error("spreadsheet_id is required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await sheetsUpdateRange(token, {
        spreadsheetId,
        range: str(this.range, "A1"),
        values: parseRows(this.values, "values")
      })
    };
  }
}

// ── Calendar ─────────────────────────────────────────────────────────

export class GoogleCalendarListEventsLibNode extends BaseNode {
  static readonly nodeType = "lib.google.CalendarListEvents";
  static readonly title = "Google Calendar List Events";
  static readonly inlineFields = ["calendar_id"];
  static readonly inputFields = [];
  static readonly description =
    "List Google Calendar events in a time window, soonest first.\n    google, calendar, events, schedule, agenda";
  static readonly metadataOutputTypes = {
    output: "dict",
    outputs: "list"
  };
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = ITEM_AND_LIST;

  @prop({
    type: "str",
    default: "primary",
    title: "Calendar ID",
    description: "Calendar id, or 'primary' for the default calendar"
  })
  declare calendar_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Time Min",
    description: "RFC3339 window start (blank for now)"
  })
  declare time_min: any;

  @prop({
    type: "str",
    default: "",
    title: "Time Max",
    description: "RFC3339 window end"
  })
  declare time_max: any;

  @prop({
    type: "int",
    default: 20,
    title: "Max Results",
    description: "Maximum number of events to return"
  })
  declare max_results: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const token = await requireGoogleAccessToken(context);
    const events = await calendarListEvents(token, {
      calendarId: str(this.calendar_id, "primary"),
      timeMin: str(this.time_min) || undefined,
      timeMax: str(this.time_max) || undefined,
      maxResults: Number(this.max_results ?? 20)
    });
    return { output: events[0] ?? null, outputs: events };
  }
}

export class GoogleCalendarCreateEventLibNode extends BaseNode {
  static readonly nodeType = "lib.google.CalendarCreateEvent";
  static readonly title = "Google Calendar Create Event";
  static readonly inlineFields = ["summary", "start", "end"];
  static readonly inputFields = [];
  static readonly description =
    "Create a Google Calendar event from RFC3339 start and end times.\n    google, calendar, event, create, schedule";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Summary",
    description: "Event title"
  })
  declare summary: any;

  @prop({
    type: "str",
    default: "",
    title: "Start",
    description: "RFC3339 start time, e.g. 2026-07-27T15:00:00-07:00"
  })
  declare start: any;

  @prop({
    type: "str",
    default: "",
    title: "End",
    description: "RFC3339 end time"
  })
  declare end: any;

  @prop({
    type: "str",
    default: "primary",
    title: "Calendar ID",
    description: "Calendar id, or 'primary' for the default calendar"
  })
  declare calendar_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Description",
    description: "Event description"
  })
  declare description: any;

  @prop({
    type: "str",
    default: "",
    title: "Attendees",
    description: "Attendee email addresses, comma-separated"
  })
  declare attendees: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const summary = str(this.summary);
    const start = str(this.start);
    const end = str(this.end);
    if (!summary) throw new Error("summary is required");
    if (!start || !end) throw new Error("start and end are required");
    const token = await requireGoogleAccessToken(context);
    return {
      output: await calendarCreateEvent(token, {
        calendarId: str(this.calendar_id, "primary"),
        summary,
        start,
        end,
        description: str(this.description) || undefined,
        attendees: splitList(this.attendees)
      })
    };
  }
}

export const LIB_GOOGLE_NODES = tagAsServer([
  GoogleDriveSearchLibNode,
  GoogleDriveReadFileLibNode,
  GoogleDriveCreateFileLibNode,
  GoogleGmailSearchLibNode,
  GoogleGmailSendLibNode,
  GoogleGmailModifyLabelsLibNode,
  GoogleDocsReadLibNode,
  GoogleDocsCreateLibNode,
  GoogleDocsAppendLibNode,
  GoogleSheetsReadLibNode,
  GoogleSheetsAppendLibNode,
  GoogleSheetsUpdateLibNode,
  GoogleCalendarListEventsLibNode,
  GoogleCalendarCreateEventLibNode
]);
