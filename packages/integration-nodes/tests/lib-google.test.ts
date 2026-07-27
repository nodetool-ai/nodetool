import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  LIB_GOOGLE_NODES,
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
} from "../src/nodes/lib-google.js";

const TOKEN = "ya29.test-token";

let originalFetch: typeof globalThis.fetch;
let requests: Array<{ url: string; init: RequestInit }> = [];

function contextWithToken(token: string | null): ProcessingContext {
  return { getSecret: async () => token } as unknown as ProcessingContext;
}

function mockFetch(reply: (url: string) => unknown): void {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(reply(url)), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  requests = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Google Workspace nodes", () => {
  it("all live in the lib.google namespace and declare no API-key settings", () => {
    expect(LIB_GOOGLE_NODES.length).toBeGreaterThan(0);
    for (const node of LIB_GOOGLE_NODES) {
      expect(node.nodeType.startsWith("lib.google.")).toBe(true);
      expect(node.requiredSettings ?? []).toEqual([]);
    }
  });

  it("tells the user to sign in when no Google account is connected", async () => {
    const node = new GoogleDriveSearchLibNode({ query: "notes" });
    await expect(node.process(contextWithToken(null))).rejects.toThrow(
      /Sign in with Google/
    );
  });

  it("emits the first file plus the full list from a Drive search", async () => {
    mockFetch(() => ({
      files: [
        { id: "1", name: "A", mimeType: "text/plain" },
        { id: "2", name: "B", mimeType: "text/plain" }
      ]
    }));

    const node = new GoogleDriveSearchLibNode({ query: "notes", max_results: 5 });
    const result = await node.process(contextWithToken(TOKEN));

    expect((result.output as { id: string }).id).toBe("1");
    expect(result.outputs).toHaveLength(2);
  });

  it("exports a Google Doc to plain text when reading it from Drive", async () => {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      requests.push({ url, init: {} });
      if (url.includes("/export")) {
        return new Response("doc body", { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "d1",
          name: "Plan",
          mimeType: "application/vnd.google-apps.document"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof globalThis.fetch;

    const node = new GoogleDriveReadFileLibNode({ file_id: "d1" });
    const result = await node.process(contextWithToken(TOKEN));

    expect(result.output).toBe("doc body");
    expect(result.mime_type).toBe("text/plain");
  });

  it("uploads new Drive files as multipart with the parent folder", async () => {
    mockFetch(() => ({ id: "f1", name: "notes.txt" }));

    const node = new GoogleDriveCreateFileLibNode({
      name: "notes.txt",
      content: "hello",
      folder_id: "folder-1"
    });
    await node.process(contextWithToken(TOKEN));

    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(String(requests[0].init.body)).toContain('"parents":["folder-1"]');
  });

  it("emits the first message plus the full list from a Gmail search", async () => {
    mockFetch((url) =>
      url.includes("/messages?")
        ? { messages: [{ id: "m1" }] }
        : {
            id: "m1",
            threadId: "t1",
            payload: { headers: [{ name: "Subject", value: "Status" }] }
          }
    );

    const node = new GoogleGmailSearchLibNode({ query: "is:unread" });
    const result = await node.process(contextWithToken(TOKEN));

    expect((result.output as { subject: string }).subject).toBe("Status");
    expect(result.outputs).toHaveLength(1);
  });

  it("archives a message by removing the INBOX label", async () => {
    mockFetch(() => ({ id: "m1", labelIds: [] }));

    const node = new GoogleGmailModifyLabelsLibNode({
      message_id: "m1",
      remove_labels: "INBOX, UNREAD"
    });
    await node.process(contextWithToken(TOKEN));

    expect(JSON.parse(String(requests[0].init.body)).removeLabelIds).toEqual([
      "INBOX",
      "UNREAD"
    ]);
  });

  it("flattens a Google Doc to text when reading it", async () => {
    mockFetch(() => ({
      documentId: "doc-1",
      title: "Plan",
      body: {
        content: [
          { paragraph: { elements: [{ textRun: { content: "Intro" } }] } }
        ]
      }
    }));

    const node = new GoogleDocsReadLibNode({ document_id: "doc-1" });
    const result = await node.process(contextWithToken(TOKEN));

    expect(result.output).toBe("Intro");
    expect(result.title).toBe("Plan");
  });

  it("creates a doc and seeds it with the given text", async () => {
    mockFetch(() => ({ documentId: "doc-1", title: "Plan" }));

    const node = new GoogleDocsCreateLibNode({ title: "Plan", text: "Intro" });
    const result = await node.process(contextWithToken(TOKEN));

    expect((result.output as { documentId: string }).documentId).toBe("doc-1");
    // Creation, then a batchUpdate that inserts the seed text.
    expect(requests[1].url).toContain(":batchUpdate");
  });

  it("appends text to an existing doc", async () => {
    mockFetch(() => ({}));

    const node = new GoogleDocsAppendLibNode({
      document_id: "doc-1",
      text: "More"
    });
    const result = await node.process(contextWithToken(TOKEN));

    expect(result.output).toBe("doc-1");
    expect(
      JSON.parse(String(requests[0].init.body)).requests[0].insertText.text
    ).toBe("More");
  });

  it("reads a sheet range and returns its rows", async () => {
    mockFetch(() => ({ values: [["a", "b"], ["c", "d"]] }));

    const node = new GoogleSheetsReadLibNode({
      spreadsheet_id: "s1",
      range: "Sheet1!A1:B2"
    });
    const result = await node.process(contextWithToken(TOKEN));

    expect(result.output).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("overwrites a sheet range with a PUT", async () => {
    mockFetch(() => ({ updatedRange: "A1:B1", updatedCells: 2 }));

    const node = new GoogleSheetsUpdateLibNode({
      spreadsheet_id: "s1",
      range: "A1",
      values: '[["Alice", 30]]'
    });
    await node.process(contextWithToken(TOKEN));

    expect(requests[0].init.method).toBe("PUT");
  });

  it("lists calendar events with the primary calendar by default", async () => {
    mockFetch(() => ({
      items: [
        {
          id: "e1",
          summary: "Standup",
          start: { dateTime: "2026-07-27T09:00:00Z" },
          end: { dateTime: "2026-07-27T09:15:00Z" }
        }
      ]
    }));

    const node = new GoogleCalendarListEventsLibNode({});
    const result = await node.process(contextWithToken(TOKEN));

    expect((result.output as { summary: string }).summary).toBe("Standup");
    expect(requests[0].url).toContain("/calendars/primary/events");
  });

  it("requires a recipient before sending mail", async () => {
    const node = new GoogleGmailSendLibNode({ subject: "Hi", body: "there" });
    await expect(node.process(contextWithToken(TOKEN))).rejects.toThrow(
      "to is required"
    );
  });

  it("parses JSON rows for a sheet append", async () => {
    mockFetch(() => ({ updates: { updatedRange: "A2:B2", updatedRows: 1 } }));

    const node = new GoogleSheetsAppendLibNode({
      spreadsheet_id: "s1",
      range: "A:B",
      values: '[["Alice", 30]]'
    });
    const result = await node.process(contextWithToken(TOKEN));

    expect((result.output as { updatedRows: number }).updatedRows).toBe(1);
    expect(JSON.parse(String(requests[0].init.body)).values).toEqual([
      ["Alice", 30]
    ]);
  });

  it("rejects malformed JSON rows with the offending value", async () => {
    const node = new GoogleSheetsAppendLibNode({
      spreadsheet_id: "s1",
      range: "A:B",
      values: "not json"
    });
    await expect(node.process(contextWithToken(TOKEN))).rejects.toThrow(
      /Invalid JSON for values/
    );
  });

  it("splits a comma-separated attendee list into addresses", async () => {
    mockFetch(() => ({ id: "e1", summary: "Sync" }));

    const node = new GoogleCalendarCreateEventLibNode({
      summary: "Sync",
      start: "2026-07-27T15:00:00-07:00",
      end: "2026-07-27T15:30:00-07:00",
      attendees: "a@example.com, b@example.com"
    });
    await node.process(contextWithToken(TOKEN));

    expect(JSON.parse(String(requests[0].init.body)).attendees).toEqual([
      { email: "a@example.com" },
      { email: "b@example.com" }
    ]);
  });
});
