/**
 * Google Workspace REST client — Drive, Gmail, Docs, Sheets and Calendar.
 *
 * Deliberately dependency-free (plain `fetch`, no googleapis SDK): the calls we
 * need are a handful of REST endpoints, and the token comes from the user's
 * Google login rather than a service account.
 *
 * Every function takes an OAuth access token. Callers resolve it from the
 * processing context (`getSecret("GOOGLE_ACCESS_TOKEN")`), which is backed by
 * the credential stored at login time.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const DOCS_API = "https://docs.googleapis.com/v1/documents";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Scopes the Google login requests so the whole toolbelt works. */
export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar"
];

/** An error carrying the HTTP status Google replied with. */
export class GoogleApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

async function request<T>(
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) ?? {})
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleApiError(
      res.status,
      res.status === 401 || res.status === 403
        ? `Google API ${res.status}: ${text || "access denied"}. The Google ` +
          "sign-in may have expired or lacks the required scope — sign out " +
          "and sign back in with Google to re-grant access."
        : `Google API ${res.status}: ${text}`
    );
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  // SAFETY: a non-JSON body is text, so the caller's `T` is `string` for the
  // endpoints that return one (e.g. a file download).
  return (await res.text()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ── Drive ────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
}

/** Google-native mime types and the plain export format we read them as. */
const DRIVE_EXPORT_FORMATS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain"
};

/**
 * Escape a phrase for a single-quoted Drive query literal.
 *
 * Backslashes go first: escaping only the quote would turn an input containing
 * `\'` into `\\'`, where the backslash escapes itself and the quote closes the
 * literal early — letting the rest of the phrase run as query syntax.
 */
function escapeDriveLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * List Drive files matching a query.
 *
 * `q` is Drive's own query syntax. A bare phrase is wrapped into a full-text
 * search so callers can pass "quarterly report" directly.
 */
export async function driveSearchFiles(
  token: string,
  opts: { q?: string; maxResults?: number; orderBy?: string } = {}
): Promise<DriveFile[]> {
  const raw = (opts.q ?? "").trim();
  const isDriveQuery = /(\bcontains\b|\b=\b|\bin parents\b|\bmimeType\b)/.test(
    raw
  );
  const q = !raw
    ? "trashed = false"
    : isDriveQuery
      ? raw
      : `fullText contains '${escapeDriveLiteral(raw)}' and trashed = false`;

  const url = `${DRIVE_API}/files${query({
    q,
    pageSize: Math.min(Math.max(opts.maxResults ?? 20, 1), 100),
    orderBy: opts.orderBy,
    fields:
      "files(id,name,mimeType,modifiedTime,size,webViewLink,owners(emailAddress,displayName))"
  })}`;
  const data = await request<{ files?: DriveFile[] }>(token, url);
  return data.files ?? [];
}

/** Fetch a file's metadata. */
export async function driveGetFile(
  token: string,
  fileId: string
): Promise<DriveFile> {
  return request<DriveFile>(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}${query({
      fields:
        "id,name,mimeType,modifiedTime,size,webViewLink,owners(emailAddress,displayName)"
    })}`
  );
}

/**
 * Read a file's content as text. Google-native files (Docs, Sheets, Slides)
 * are exported to a plain format; everything else is downloaded as-is.
 */
export async function driveReadFile(
  token: string,
  fileId: string
): Promise<{ name: string; mimeType: string; content: string }> {
  const meta = await driveGetFile(token, fileId);
  const exportFormat = DRIVE_EXPORT_FORMATS[meta.mimeType];
  const url = exportFormat
    ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export${query({
        mimeType: exportFormat
      })}`
    : `${DRIVE_API}/files/${encodeURIComponent(fileId)}${query({ alt: "media" })}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleApiError(res.status, `Drive download failed: ${text}`);
  }
  return {
    name: meta.name,
    mimeType: exportFormat ?? meta.mimeType,
    content: await res.text()
  };
}

/** Create a plain-text file in Drive (optionally inside a folder). */
export async function driveCreateFile(
  token: string,
  opts: {
    name: string;
    content: string;
    mimeType?: string;
    folderId?: string;
  }
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: opts.name };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const boundary = `nodetool-${Math.random().toString(36).slice(2)}`;
  const mimeType = opts.mimeType ?? "text/plain";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
    `${opts.content}\r\n--${boundary}--`;

  return request<DriveFile>(
    token,
    `${DRIVE_UPLOAD_API}/files${query({
      uploadType: "multipart",
      fields: "id,name,mimeType,webViewLink"
    })}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    }
  );
}

// ── Gmail ────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}

interface GmailRawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPayloadPart;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function header(part: GmailPayloadPart | undefined, name: string): string {
  const match = part?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return match?.value ?? "";
}

/** Walk the MIME tree and return the first text/plain body (else text/html). */
function extractBody(part: GmailPayloadPart | undefined): string {
  if (!part) return "";
  if (part.body?.data && part.mimeType?.startsWith("text/")) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    if (child.mimeType === "text/plain" && child.body?.data) {
      return decodeBase64Url(child.body.data);
    }
  }
  for (const child of part.parts ?? []) {
    const nested = extractBody(child);
    if (nested) return nested;
  }
  return "";
}

function toGmailMessage(raw: GmailRawMessage): GmailMessage {
  return {
    id: raw.id,
    threadId: raw.threadId,
    subject: header(raw.payload, "Subject"),
    from: header(raw.payload, "From"),
    to: header(raw.payload, "To"),
    date: header(raw.payload, "Date"),
    snippet: raw.snippet ?? "",
    body: extractBody(raw.payload),
    labelIds: raw.labelIds ?? []
  };
}

/** Fetch one message, fully parsed. */
export async function gmailGetMessage(
  token: string,
  messageId: string
): Promise<GmailMessage> {
  const raw = await request<GmailRawMessage>(
    token,
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}${query({
      format: "full"
    })}`
  );
  return toGmailMessage(raw);
}

/**
 * Search the mailbox with Gmail's own query syntax
 * (e.g. `from:alice@example.com is:unread newer_than:7d`).
 */
export async function gmailSearchMessages(
  token: string,
  opts: { q?: string; maxResults?: number } = {}
): Promise<GmailMessage[]> {
  const list = await request<{ messages?: Array<{ id: string }> }>(
    token,
    `${GMAIL_API}/messages${query({
      q: opts.q,
      maxResults: Math.min(Math.max(opts.maxResults ?? 10, 1), 50)
    })}`
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  return Promise.all(ids.map((id) => gmailGetMessage(token, id)));
}

/** Send a plain-text email. Returns the created message id. */
export async function gmailSendMessage(
  token: string,
  opts: { to: string; subject: string; body: string; cc?: string; bcc?: string }
): Promise<{ id: string; threadId: string }> {
  const lines = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : null,
    opts.bcc ? `Bcc: ${opts.bcc}` : null,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    opts.body
  ].filter((line): line is string => line !== null);

  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");

  return request<{ id: string; threadId: string }>(
    token,
    `${GMAIL_API}/messages/send`,
    { method: "POST", body: JSON.stringify({ raw }) }
  );
}

/** Add and/or remove labels on a message (archive = remove `INBOX`). */
export async function gmailModifyLabels(
  token: string,
  opts: { messageId: string; addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<{ id: string; labelIds: string[] }> {
  return request<{ id: string; labelIds: string[] }>(
    token,
    `${GMAIL_API}/messages/${encodeURIComponent(opts.messageId)}/modify`,
    {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: opts.addLabelIds ?? [],
        removeLabelIds: opts.removeLabelIds ?? []
      })
    }
  );
}

/** List the mailbox's labels (id + name). */
export async function gmailListLabels(
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const data = await request<{
    labels?: Array<{ id: string; name: string }>;
  }>(token, `${GMAIL_API}/labels`);
  return data.labels ?? [];
}

// ── Docs ─────────────────────────────────────────────────────────────

interface DocsTextRun {
  textRun?: { content?: string };
}

interface DocsStructuralElement {
  paragraph?: { elements?: DocsTextRun[] };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ content?: DocsStructuralElement[] }>;
    }>;
  };
}

interface DocsDocument {
  documentId: string;
  title?: string;
  body?: { content?: DocsStructuralElement[] };
}

function docsToText(content: DocsStructuralElement[] | undefined): string {
  let out = "";
  for (const element of content ?? []) {
    for (const run of element.paragraph?.elements ?? []) {
      out += run.textRun?.content ?? "";
    }
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        out += docsToText(cell.content);
      }
    }
  }
  return out;
}

/** Read a Google Doc as plain text. */
export async function docsGetDocument(
  token: string,
  documentId: string
): Promise<{ documentId: string; title: string; text: string }> {
  const doc = await request<DocsDocument>(
    token,
    `${DOCS_API}/${encodeURIComponent(documentId)}`
  );
  return {
    documentId: doc.documentId,
    title: doc.title ?? "",
    text: docsToText(doc.body?.content)
  };
}

/** Create a Google Doc, optionally seeded with text. */
export async function docsCreateDocument(
  token: string,
  opts: { title: string; text?: string }
): Promise<{ documentId: string; title: string; url: string }> {
  const doc = await request<DocsDocument>(token, DOCS_API, {
    method: "POST",
    body: JSON.stringify({ title: opts.title })
  });
  if (opts.text) {
    await docsAppendText(token, { documentId: doc.documentId, text: opts.text });
  }
  return {
    documentId: doc.documentId,
    title: doc.title ?? opts.title,
    url: `https://docs.google.com/document/d/${doc.documentId}/edit`
  };
}

/** Append text to the end of a Google Doc. */
export async function docsAppendText(
  token: string,
  opts: { documentId: string; text: string }
): Promise<void> {
  await request(
    token,
    `${DOCS_API}/${encodeURIComponent(opts.documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          { insertText: { endOfSegmentLocation: {}, text: opts.text } }
        ]
      })
    }
  );
}

// ── Sheets ───────────────────────────────────────────────────────────

/** Read a range (A1 notation) as a row-major array of cell strings. */
export async function sheetsReadRange(
  token: string,
  opts: { spreadsheetId: string; range: string }
): Promise<string[][]> {
  const data = await request<{ values?: string[][] }>(
    token,
    `${SHEETS_API}/${encodeURIComponent(opts.spreadsheetId)}/values/${encodeURIComponent(
      opts.range
    )}`
  );
  return data.values ?? [];
}

/** Append rows below the last populated row of a range. */
export async function sheetsAppendRows(
  token: string,
  opts: { spreadsheetId: string; range: string; values: unknown[][] }
): Promise<{ updatedRange: string; updatedRows: number }> {
  const data = await request<{
    updates?: { updatedRange?: string; updatedRows?: number };
  }>(
    token,
    `${SHEETS_API}/${encodeURIComponent(opts.spreadsheetId)}/values/${encodeURIComponent(
      opts.range
    )}:append${query({
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS"
    })}`,
    { method: "POST", body: JSON.stringify({ values: opts.values }) }
  );
  return {
    updatedRange: data.updates?.updatedRange ?? opts.range,
    updatedRows: data.updates?.updatedRows ?? 0
  };
}

/** Overwrite a range with the given values. */
export async function sheetsUpdateRange(
  token: string,
  opts: { spreadsheetId: string; range: string; values: unknown[][] }
): Promise<{ updatedRange: string; updatedCells: number }> {
  const data = await request<{
    updatedRange?: string;
    updatedCells?: number;
  }>(
    token,
    `${SHEETS_API}/${encodeURIComponent(opts.spreadsheetId)}/values/${encodeURIComponent(
      opts.range
    )}${query({ valueInputOption: "USER_ENTERED" })}`,
    { method: "PUT", body: JSON.stringify({ values: opts.values }) }
  );
  return {
    updatedRange: data.updatedRange ?? opts.range,
    updatedCells: data.updatedCells ?? 0
  };
}

/** Create a spreadsheet, optionally seeded with rows on the first sheet. */
export async function sheetsCreateSpreadsheet(
  token: string,
  opts: { title: string; values?: unknown[][] }
): Promise<{ spreadsheetId: string; url: string }> {
  const data = await request<{ spreadsheetId: string; spreadsheetUrl?: string }>(
    token,
    SHEETS_API,
    {
      method: "POST",
      body: JSON.stringify({ properties: { title: opts.title } })
    }
  );
  if (opts.values?.length) {
    await sheetsUpdateRange(token, {
      spreadsheetId: data.spreadsheetId,
      range: "A1",
      values: opts.values
    });
  }
  return {
    spreadsheetId: data.spreadsheetId,
    url:
      data.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
  };
}

// ── Calendar ─────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  attendees: string[];
  htmlLink?: string;
}

interface RawCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
}

function toCalendarEvent(raw: RawCalendarEvent): CalendarEvent {
  return {
    id: raw.id,
    summary: raw.summary ?? "",
    description: raw.description,
    location: raw.location,
    start: raw.start?.dateTime ?? raw.start?.date ?? "",
    end: raw.end?.dateTime ?? raw.end?.date ?? "",
    attendees: (raw.attendees ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e)),
    htmlLink: raw.htmlLink
  };
}

/** List the user's calendars. */
export async function calendarListCalendars(
  token: string
): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const data = await request<{
    items?: Array<{ id: string; summary: string; primary?: boolean }>;
  }>(token, `${CALENDAR_API}/users/me/calendarList`);
  return data.items ?? [];
}

/** List events in a time window, soonest first. */
export async function calendarListEvents(
  token: string,
  opts: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    q?: string;
    maxResults?: number;
  } = {}
): Promise<CalendarEvent[]> {
  const calendarId = opts.calendarId || "primary";
  const data = await request<{ items?: RawCalendarEvent[] }>(
    token,
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events${query({
      timeMin: opts.timeMin ?? new Date().toISOString(),
      timeMax: opts.timeMax,
      q: opts.q,
      maxResults: Math.min(Math.max(opts.maxResults ?? 20, 1), 250),
      singleEvents: "true",
      orderBy: "startTime"
    })}`
  );
  return (data.items ?? []).map(toCalendarEvent);
}

/** Create an event. Times are RFC3339 (`2026-07-27T15:00:00-07:00`). */
export async function calendarCreateEvent(
  token: string,
  opts: {
    calendarId?: string;
    summary: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }
): Promise<CalendarEvent> {
  const calendarId = opts.calendarId || "primary";
  const raw = await request<RawCalendarEvent>(
    token,
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: opts.summary,
        description: opts.description,
        location: opts.location,
        start: { dateTime: opts.start },
        end: { dateTime: opts.end },
        attendees: (opts.attendees ?? []).map((email) => ({ email }))
      })
    }
  );
  return toCalendarEvent(raw);
}

/** Delete an event. */
export async function calendarDeleteEvent(
  token: string,
  opts: { calendarId?: string; eventId: string }
): Promise<void> {
  const calendarId = opts.calendarId || "primary";
  await request(
    token,
    `${CALENDAR_API}/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(opts.eventId)}`,
    { method: "DELETE" }
  );
}
