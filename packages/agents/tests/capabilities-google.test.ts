/**
 * The `google` capability module: the twenty Drive/Gmail/Docs/Sheets/Calendar
 * capabilities.
 *
 * Nothing here talks to Google. What a port can break without a network is the
 * surface — a renamed wire name, a dropped schema field, a reclassified
 * capability — and the one behaviour the base class contributed: a failure
 * comes back as `{error}` instead of throwing, so an agent can re-authenticate
 * rather than abort the step. A run with no Google token exercises exactly
 * that path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { GOOGLE_CAPABILITIES } from "../src/capabilities/google.js";
import {
  capabilityCategoryFor,
  capabilityModuleDrift,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { getGoogleWorkspaceTools } from "../src/tools/google-workspace-tools.js";

/** A context with no Google credential — `getSecret` finds nothing. */
function tokenlessContext(): ProcessingContext {
  return {
    getSecret: async () => undefined,
    get: () => undefined,
    set: () => {}
  } as unknown as ProcessingContext;
}

describe("the google capability module", () => {
  it("registers without drift and exports the twenty wire names", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
    const mod = await loadCapabilityModule("google");
    expect(mod.exports.map((e) => e.spec.name)).toEqual([
      "google_drive_search",
      "google_drive_get_file",
      "google_drive_read_file",
      "google_drive_create_file",
      "gmail_search",
      "gmail_get_message",
      "gmail_send_message",
      "gmail_modify_labels",
      "gmail_list_labels",
      "google_docs_read",
      "google_docs_create",
      "google_docs_append",
      "google_sheets_read",
      "google_sheets_append",
      "google_sheets_update",
      "google_sheets_create",
      "google_calendar_list_calendars",
      "google_calendar_list_events",
      "google_calendar_create_event",
      "google_calendar_delete_event"
    ]);
  });

  it("classes every capability exactly as the permission map does", () => {
    for (const entry of GOOGLE_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("leaves the deprecated classes with the surface they had", () => {
    const tools = new Map(getGoogleWorkspaceTools().map((t) => [t.name, t]));
    expect(tools.size).toBe(GOOGLE_CAPABILITIES.length);
    for (const entry of GOOGLE_CAPABILITIES) {
      const tool = tools.get(entry.spec.name);
      expect(tool).toBeDefined();
      expect(tool?.description).toBe(entry.spec.description);
      expect(tool?.inputSchema).toEqual(entry.spec.inputSchema);
      expect(tool?.userMessage({ query: "q", name: "n", title: "t" })).toBe(
        entry.spec.userMessage?.({ query: "q", name: "n", title: "t" })
      );
    }
  });

  it("returns the missing-token failure as a result, not a throw", async () => {
    const run = createCapabilityRun({
      context: tokenlessContext(),
      gate: UNGATED
    });
    for (const entry of GOOGLE_CAPABILITIES) {
      const result = (await run.invoke(entry.spec.name, {})) as {
        error?: string;
      };
      expect(typeof result.error).toBe("string");
    }
  });
});

/**
 * Each capability against a faked Google, at the one seam the client has:
 * `fetch`. The fake answers with recorded response shapes and records every
 * request, so each case pins both halves a port or a client edit could break —
 * what reaches Google (method, URL, body) and what the agent gets back.
 */
describe("the google capabilities against a recorded Google", () => {
  const TOKEN = "ya29.recorded-token";

  interface Recorded {
    method: string;
    url: URL;
    body: string | undefined;
    headers: Record<string, string>;
  }

  let requests: Recorded[] = [];
  let routes: Array<{
    method: string;
    match: (url: URL) => boolean;
    reply: () => Response;
  }> = [];
  let realFetch: typeof globalThis.fetch;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });

  /** Answer `method` requests whose URL `match` accepts with `reply`. */
  function route(
    method: string,
    match: (url: URL) => boolean,
    reply: () => Response
  ): void {
    routes.push({ method, match, reply });
  }

  const path = (prefix: string) => (url: URL) =>
    `${url.origin}${url.pathname}` === prefix;

  const b64url = (text: string): string =>
    Buffer.from(text, "utf8").toString("base64url");

  beforeEach(() => {
    requests = [];
    routes = [];
    realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = new URL(String(input));
      requests.push({
        method,
        url,
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: (init?.headers as Record<string, string>) ?? {}
      });
      const hit = routes.find((r) => r.method === method && r.match(url));
      if (!hit) throw new Error(`unexpected request ${method} ${url.href}`);
      return hit.reply();
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function connected(): ReturnType<typeof createCapabilityRun> {
    const context = {
      getSecret: async (key: string) =>
        key === "GOOGLE_ACCESS_TOKEN" ? TOKEN : undefined
    } as unknown as ProcessingContext;
    return createCapabilityRun({ context, gate: UNGATED });
  }

  async function invoke(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    return (await connected().invoke(name, args)) as Record<string, unknown>;
  }

  const bodyOf = (r: Recorded): unknown => JSON.parse(r.body ?? "null");

  describe("Drive", () => {
    it("google_drive_search wraps a bare phrase into a full-text query", async () => {
      route("GET", path("https://www.googleapis.com/drive/v3/files"), () =>
        json({
          files: [{ id: "f1", name: "Q3 report", mimeType: "text/plain" }]
        })
      );

      const result = await invoke("google_drive_search", {
        query: "q3 report",
        max_results: 5
      });

      expect(result).toEqual({
        files: [{ id: "f1", name: "Q3 report", mimeType: "text/plain" }]
      });
      expect(requests).toHaveLength(1);
      const [req] = requests;
      expect(req.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(req.url.searchParams.get("q")).toBe(
        "fullText contains 'q3 report' and trashed = false"
      );
      expect(req.url.searchParams.get("pageSize")).toBe("5");
    });

    it("google_drive_get_file reads one file's metadata by id", async () => {
      route(
        "GET",
        path("https://www.googleapis.com/drive/v3/files/file%2F1"),
        () => json({ id: "file/1", name: "notes.txt", mimeType: "text/plain" })
      );

      const result = await invoke("google_drive_get_file", {
        file_id: "file/1"
      });

      expect(result).toMatchObject({ id: "file/1", name: "notes.txt" });
      expect(requests[0].url.searchParams.get("fields")).toContain("webViewLink");
    });

    it("google_drive_read_file exports a Google Doc as plain text", async () => {
      route("GET", path("https://www.googleapis.com/drive/v3/files/doc1"), () =>
        json({
          id: "doc1",
          name: "Plan",
          mimeType: "application/vnd.google-apps.document"
        })
      );
      route(
        "GET",
        path("https://www.googleapis.com/drive/v3/files/doc1/export"),
        () =>
          new Response("Step one.\nStep two.", {
            status: 200,
            headers: { "content-type": "text/plain" }
          })
      );

      const result = await invoke("google_drive_read_file", {
        file_id: "doc1"
      });

      expect(result).toEqual({
        name: "Plan",
        mimeType: "text/plain",
        content: "Step one.\nStep two."
      });
      expect(requests.map((r) => r.url.pathname)).toEqual([
        "/drive/v3/files/doc1",
        "/drive/v3/files/doc1/export"
      ]);
      expect(requests[1].url.searchParams.get("mimeType")).toBe("text/plain");
    });

    it("google_drive_create_file uploads metadata and content as one multipart body", async () => {
      route(
        "POST",
        path("https://www.googleapis.com/upload/drive/v3/files"),
        () => json({ id: "new1", name: "todo.md", mimeType: "text/markdown" })
      );

      const result = await invoke("google_drive_create_file", {
        name: "todo.md",
        content: "- ship it",
        mime_type: "text/markdown",
        folder_id: "folder9"
      });

      expect(result).toMatchObject({ id: "new1", name: "todo.md" });
      const [req] = requests;
      expect(req.url.searchParams.get("uploadType")).toBe("multipart");
      expect(req.headers["Content-Type"]).toMatch(
        /^multipart\/related; boundary=/
      );
      expect(req.body).toContain(
        JSON.stringify({ name: "todo.md", parents: ["folder9"] })
      );
      expect(req.body).toContain("Content-Type: text/markdown\r\n\r\n- ship it");
    });
  });

  describe("Gmail", () => {
    const rawMessage = (id: string, subject: string, text: string) => ({
      id,
      threadId: `t-${id}`,
      snippet: text.slice(0, 10),
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "Subject", value: subject },
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Date", value: "Mon, 2 Nov 2026 09:00:00 +0000" }
        ],
        parts: [
          { mimeType: "text/html", body: { data: b64url(`<p>${text}</p>`) } },
          { mimeType: "text/plain", body: { data: b64url(text) } }
        ]
      }
    });

    it("gmail_search lists matching ids, then fetches and decodes each message", async () => {
      route(
        "GET",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages"),
        () => json({ messages: [{ id: "m1" }, { id: "m2" }] })
      );
      route(
        "GET",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1"),
        () => json(rawMessage("m1", "Invoice", "Your invoice is attached."))
      );
      route(
        "GET",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages/m2"),
        () => json(rawMessage("m2", "Lunch", "Noon works."))
      );

      const result = await invoke("gmail_search", {
        query: "from:alice is:unread",
        max_results: 2
      });

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages.map((m) => [m.id, m.subject, m.body])).toEqual([
        ["m1", "Invoice", "Your invoice is attached."],
        ["m2", "Lunch", "Noon works."]
      ]);
      expect(requests[0].url.searchParams.get("q")).toBe("from:alice is:unread");
      expect(requests[0].url.searchParams.get("maxResults")).toBe("2");
    });

    it("gmail_get_message prefers the text/plain part and flattens the headers", async () => {
      route(
        "GET",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1"),
        () => json(rawMessage("m1", "Invoice", "Plain wins."))
      );

      const result = await invoke("gmail_get_message", { message_id: "m1" });

      expect(result).toEqual({
        id: "m1",
        threadId: "t-m1",
        subject: "Invoice",
        from: "alice@example.com",
        to: "me@example.com",
        date: "Mon, 2 Nov 2026 09:00:00 +0000",
        snippet: "Plain wins",
        body: "Plain wins.",
        labelIds: ["INBOX", "UNREAD"]
      });
      expect(requests[0].url.searchParams.get("format")).toBe("full");
    });

    it("gmail_send_message POSTs one base64url RFC 822 message to messages/send", async () => {
      route(
        "POST",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages/send"),
        () => json({ id: "sent1", threadId: "thread1" })
      );

      const result = await invoke("gmail_send_message", {
        to: "bob@example.com",
        subject: "Status",
        body: "All green.",
        cc: "carol@example.com"
      });

      expect(result).toEqual({ id: "sent1", threadId: "thread1" });
      expect(requests).toHaveLength(1);
      const [req] = requests;
      expect(req.method).toBe("POST");
      expect(req.headers["Content-Type"]).toBe("application/json");
      const { raw } = bodyOf(req) as { raw: string };
      expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(
        [
          "To: bob@example.com",
          "Cc: carol@example.com",
          "Subject: Status",
          "Content-Type: text/plain; charset=UTF-8",
          "",
          "All green."
        ].join("\r\n")
      );
    });

    it("gmail_modify_labels POSTs both label lists to the message's modify route", async () => {
      route(
        "POST",
        path("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/modify"),
        () => json({ id: "m1", labelIds: ["STARRED"] })
      );

      const result = await invoke("gmail_modify_labels", {
        message_id: "m1",
        add_label_ids: ["STARRED"],
        remove_label_ids: ["INBOX", 7]
      });

      expect(result).toEqual({ id: "m1", labelIds: ["STARRED"] });
      expect(bodyOf(requests[0])).toEqual({
        addLabelIds: ["STARRED"],
        removeLabelIds: ["INBOX"]
      });
    });

    it("gmail_list_labels returns the mailbox's labels", async () => {
      route(
        "GET",
        path("https://gmail.googleapis.com/gmail/v1/users/me/labels"),
        () => json({ labels: [{ id: "INBOX", name: "INBOX" }] })
      );

      await expect(invoke("gmail_list_labels")).resolves.toEqual({
        labels: [{ id: "INBOX", name: "INBOX" }]
      });
    });
  });

  describe("Docs", () => {
    it("google_docs_read flattens paragraphs and table cells into text", async () => {
      route("GET", path("https://docs.googleapis.com/v1/documents/d1"), () =>
        json({
          documentId: "d1",
          title: "Spec",
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    { textRun: { content: "Intro " } },
                    { textRun: { content: "line\n" } }
                  ]
                }
              },
              {
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {
                          content: [
                            { paragraph: { elements: [{ textRun: { content: "A1\n" } }] } }
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            ]
          }
        })
      );

      await expect(
        invoke("google_docs_read", { document_id: "d1" })
      ).resolves.toEqual({ documentId: "d1", title: "Spec", text: "Intro line\nA1\n" });
    });

    it("google_docs_create creates the doc, then seeds it with one insertText", async () => {
      route("POST", path("https://docs.googleapis.com/v1/documents"), () =>
        json({ documentId: "d2", title: "Draft" })
      );
      route(
        "POST",
        path("https://docs.googleapis.com/v1/documents/d2:batchUpdate"),
        () => json({ replies: [{}] })
      );

      const result = await invoke("google_docs_create", {
        title: "Draft",
        text: "Hello."
      });

      expect(result).toEqual({
        documentId: "d2",
        title: "Draft",
        url: "https://docs.google.com/document/d/d2/edit"
      });
      expect(requests.map((r) => [r.method, r.url.pathname])).toEqual([
        ["POST", "/v1/documents"],
        ["POST", "/v1/documents/d2:batchUpdate"]
      ]);
      expect(bodyOf(requests[0])).toEqual({ title: "Draft" });
      expect(bodyOf(requests[1])).toEqual({
        requests: [{ insertText: { endOfSegmentLocation: {}, text: "Hello." } }]
      });
    });

    it("google_docs_append inserts at the end of the body", async () => {
      route(
        "POST",
        path("https://docs.googleapis.com/v1/documents/d3:batchUpdate"),
        () => json({ replies: [{}] })
      );

      const result = await invoke("google_docs_append", {
        document_id: "d3",
        text: "More."
      });

      expect(result).toEqual({ success: true, document_id: "d3" });
      expect(bodyOf(requests[0])).toEqual({
        requests: [{ insertText: { endOfSegmentLocation: {}, text: "More." } }]
      });
    });
  });

  describe("Sheets", () => {
    const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

    it("google_sheets_read returns the rows and their count", async () => {
      route("GET", path(`${SHEETS}/s1/values/Sheet1!A1%3AB2`), () =>
        json({ values: [["a", "b"], ["1", "2"]] })
      );

      await expect(
        invoke("google_sheets_read", { spreadsheet_id: "s1", range: "Sheet1!A1:B2" })
      ).resolves.toEqual({ values: [["a", "b"], ["1", "2"]], row_count: 2 });
    });

    it("google_sheets_append POSTs rows to :append as user-entered inserts", async () => {
      route("POST", path(`${SHEETS}/s1/values/Sheet1:append`), () =>
        json({ updates: { updatedRange: "Sheet1!A5:B6", updatedRows: 2 } })
      );

      const result = await invoke("google_sheets_append", {
        spreadsheet_id: "s1",
        range: "Sheet1",
        values: [["x", 1], "y"]
      });

      expect(result).toEqual({ updatedRange: "Sheet1!A5:B6", updatedRows: 2 });
      const [req] = requests;
      expect(req.url.searchParams.get("valueInputOption")).toBe("USER_ENTERED");
      expect(req.url.searchParams.get("insertDataOption")).toBe("INSERT_ROWS");
      // A bare value becomes a one-cell row rather than being dropped.
      expect(bodyOf(req)).toEqual({ values: [["x", 1], ["y"]] });
    });

    it("google_sheets_update PUTs the values over the range", async () => {
      route("PUT", path(`${SHEETS}/s1/values/A1`), () =>
        json({ updatedRange: "Sheet1!A1:A1", updatedCells: 1 })
      );

      const result = await invoke("google_sheets_update", {
        spreadsheet_id: "s1",
        range: "A1",
        values: [["done"]]
      });

      expect(result).toEqual({ updatedRange: "Sheet1!A1:A1", updatedCells: 1 });
      expect(requests[0].method).toBe("PUT");
      expect(bodyOf(requests[0])).toEqual({ values: [["done"]] });
    });

    it("google_sheets_create creates the spreadsheet, then writes the seed rows at A1", async () => {
      route("POST", path(SHEETS), () => json({ spreadsheetId: "s2" }));
      route("PUT", path(`${SHEETS}/s2/values/A1`), () =>
        json({ updatedRange: "Sheet1!A1:B1", updatedCells: 2 })
      );

      const result = await invoke("google_sheets_create", {
        title: "Budget",
        values: [["item", "cost"]]
      });

      expect(result).toEqual({
        spreadsheetId: "s2",
        url: "https://docs.google.com/spreadsheets/d/s2/edit"
      });
      expect(bodyOf(requests[0])).toEqual({ properties: { title: "Budget" } });
      expect(requests[1].method).toBe("PUT");
      expect(bodyOf(requests[1])).toEqual({ values: [["item", "cost"]] });
    });
  });

  describe("Calendar", () => {
    const CALENDAR = "https://www.googleapis.com/calendar/v3";

    it("google_calendar_list_calendars returns the calendar list", async () => {
      route("GET", path(`${CALENDAR}/users/me/calendarList`), () =>
        json({ items: [{ id: "primary", summary: "Me", primary: true }] })
      );

      await expect(invoke("google_calendar_list_calendars")).resolves.toEqual({
        calendars: [{ id: "primary", summary: "Me", primary: true }]
      });
    });

    it("google_calendar_list_events expands recurrences and normalizes times", async () => {
      route("GET", path(`${CALENDAR}/calendars/team%40example.com/events`), () =>
        json({
          items: [
            {
              id: "e1",
              summary: "Standup",
              start: { dateTime: "2026-11-23T09:00:00Z" },
              end: { dateTime: "2026-11-23T09:15:00Z" },
              attendees: [{ email: "a@example.com" }, {}]
            },
            { id: "e2", start: { date: "2026-11-24" }, end: { date: "2026-11-25" } }
          ]
        })
      );

      const result = await invoke("google_calendar_list_events", {
        calendar_id: "team@example.com",
        time_min: "2026-11-23T00:00:00Z",
        time_max: "2026-11-30T00:00:00Z",
        query: "standup"
      });

      expect(result.events).toEqual([
        {
          id: "e1",
          summary: "Standup",
          description: undefined,
          location: undefined,
          start: "2026-11-23T09:00:00Z",
          end: "2026-11-23T09:15:00Z",
          attendees: ["a@example.com"],
          htmlLink: undefined
        },
        {
          id: "e2",
          summary: "",
          description: undefined,
          location: undefined,
          start: "2026-11-24",
          end: "2026-11-25",
          attendees: [],
          htmlLink: undefined
        }
      ]);
      const params = requests[0].url.searchParams;
      expect(params.get("timeMin")).toBe("2026-11-23T00:00:00Z");
      expect(params.get("timeMax")).toBe("2026-11-30T00:00:00Z");
      expect(params.get("q")).toBe("standup");
      expect(params.get("singleEvents")).toBe("true");
      expect(params.get("orderBy")).toBe("startTime");
    });

    it("google_calendar_create_event POSTs the event to the primary calendar by default", async () => {
      route("POST", path(`${CALENDAR}/calendars/primary/events`), () =>
        json({
          id: "e9",
          summary: "Review",
          htmlLink: "https://calendar.google.com/event?eid=e9",
          start: { dateTime: "2026-11-24T15:00:00Z" },
          end: { dateTime: "2026-11-24T16:00:00Z" },
          attendees: [{ email: "bob@example.com" }]
        })
      );

      const result = await invoke("google_calendar_create_event", {
        summary: "Review",
        start: "2026-11-24T15:00:00Z",
        end: "2026-11-24T16:00:00Z",
        location: "Room 1",
        attendees: ["bob@example.com"]
      });

      expect(result).toMatchObject({
        id: "e9",
        summary: "Review",
        start: "2026-11-24T15:00:00Z",
        attendees: ["bob@example.com"]
      });
      expect(bodyOf(requests[0])).toEqual({
        summary: "Review",
        location: "Room 1",
        start: { dateTime: "2026-11-24T15:00:00Z" },
        end: { dateTime: "2026-11-24T16:00:00Z" },
        attendees: [{ email: "bob@example.com" }]
      });
    });

    it("google_calendar_delete_event sends one DELETE for the event and reads the 204", async () => {
      route(
        "DELETE",
        path(`${CALENDAR}/calendars/team%40example.com/events/e%2F1`),
        () => new Response(null, { status: 204 })
      );

      const result = await invoke("google_calendar_delete_event", {
        calendar_id: "team@example.com",
        event_id: "e/1"
      });

      expect(result).toEqual({ success: true, event_id: "e/1" });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("DELETE");
      expect(requests[0].body).toBeUndefined();
    });
  });

  it("returns Google's refusal as an error result that says to sign in again", async () => {
    route(
      "DELETE",
      path("https://www.googleapis.com/calendar/v3/calendars/primary/events/e1"),
      () => new Response("insufficient scope", { status: 403 })
    );

    const result = await invoke("google_calendar_delete_event", {
      event_id: "e1"
    });

    expect(String(result.error)).toContain("Google API 403: insufficient scope");
    expect(String(result.error)).toContain("sign back in with Google");
  });
});
