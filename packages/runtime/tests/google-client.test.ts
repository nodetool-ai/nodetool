import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleApiError,
  driveSearchFiles,
  driveCreateFile,
  gmailSearchMessages,
  gmailSendMessage,
  docsGetDocument,
  sheetsAppendRows,
  calendarListEvents,
  calendarCreateEvent
} from "../src/google/client.js";
import { requireGoogleAccessToken } from "../src/google/token.js";

const TOKEN = "ya29.test-token";

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];
let originalFetch: typeof globalThis.fetch;

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function mockFetch(handler: (url: string, init: RequestInit) => Response): void {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as unknown as typeof globalThis.fetch;
}

/** Gmail bodies arrive base64url-encoded. */
function b64url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("requireGoogleAccessToken", () => {
  it("returns the token from the context", async () => {
    const context = { getSecret: async () => TOKEN };
    await expect(requireGoogleAccessToken(context)).resolves.toBe(TOKEN);
  });

  it("throws a sign-in hint when no credential is stored", async () => {
    const context = { getSecret: async () => null };
    await expect(requireGoogleAccessToken(context)).rejects.toThrow(
      /Sign in with Google/
    );
  });
});

describe("drive", () => {
  it("wraps a bare phrase into a full-text query", async () => {
    mockFetch(() => jsonReply({ files: [{ id: "1", name: "Report" }] }));
    const files = await driveSearchFiles(TOKEN, { q: "quarterly report" });

    expect(files).toHaveLength(1);
    const q = new URL(calls[0].url).searchParams.get("q");
    expect(q).toBe("fullText contains 'quarterly report' and trashed = false");
  });

  it("passes Drive query syntax through untouched", async () => {
    mockFetch(() => jsonReply({ files: [] }));
    await driveSearchFiles(TOKEN, { q: "name contains 'budget'" });

    expect(new URL(calls[0].url).searchParams.get("q")).toBe(
      "name contains 'budget'"
    );
  });

  it("sends a multipart upload when creating a file", async () => {
    mockFetch(() => jsonReply({ id: "new-file", name: "notes.txt" }));
    await driveCreateFile(TOKEN, {
      name: "notes.txt",
      content: "hello",
      folderId: "folder-1"
    });

    const { init } = calls[0];
    const contentType = (init.headers as Record<string, string>)["Content-Type"];
    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    expect(String(init.body)).toContain('"parents":["folder-1"]');
    expect(String(init.body)).toContain("hello");
  });

  it("surfaces the re-authentication hint on a 403", async () => {
    mockFetch(() => new Response("insufficient scope", { status: 403 }));
    await expect(driveSearchFiles(TOKEN, { q: "x" })).rejects.toThrow(
      GoogleApiError
    );
  });
});

describe("gmail", () => {
  it("decodes the plain-text part of a multipart message", async () => {
    mockFetch((url) => {
      if (url.includes("/messages?")) {
        return jsonReply({ messages: [{ id: "m1" }] });
      }
      return jsonReply({
        id: "m1",
        threadId: "t1",
        snippet: "hi",
        labelIds: ["INBOX"],
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "Subject", value: "Status" },
            { name: "From", value: "alice@example.com" }
          ],
          parts: [
            { mimeType: "text/html", body: { data: b64url("<b>no</b>") } },
            { mimeType: "text/plain", body: { data: b64url("the body") } }
          ]
        }
      });
    });

    const [message] = await gmailSearchMessages(TOKEN, { q: "is:unread" });
    expect(message.subject).toBe("Status");
    expect(message.from).toBe("alice@example.com");
    expect(message.body).toBe("the body");
  });

  it("base64url-encodes the RFC822 message when sending", async () => {
    mockFetch(() => jsonReply({ id: "sent-1", threadId: "t1" }));
    await gmailSendMessage(TOKEN, {
      to: "bob@example.com",
      subject: "Hi",
      body: "there"
    });

    const raw = JSON.parse(String(calls[0].init.body)).raw as string;
    expect(raw).not.toMatch(/[+/=]/);
    const decoded = Buffer.from(
      raw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    expect(decoded).toContain("To: bob@example.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("there");
  });
});

describe("docs", () => {
  it("flattens paragraphs and table cells into plain text", async () => {
    mockFetch(() =>
      jsonReply({
        documentId: "doc-1",
        title: "Plan",
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: "Intro\n" } }] } },
            {
              table: {
                tableRows: [
                  {
                    tableCells: [
                      {
                        content: [
                          {
                            paragraph: {
                              elements: [{ textRun: { content: "Cell" } }]
                            }
                          }
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

    const doc = await docsGetDocument(TOKEN, "doc-1");
    expect(doc.title).toBe("Plan");
    expect(doc.text).toBe("Intro\nCell");
  });
});

describe("sheets", () => {
  it("appends rows with USER_ENTERED input", async () => {
    mockFetch(() =>
      jsonReply({ updates: { updatedRange: "Sheet1!A2:B2", updatedRows: 1 } })
    );
    const result = await sheetsAppendRows(TOKEN, {
      spreadsheetId: "sheet-1",
      range: "Sheet1!A:B",
      values: [["Alice", 30]]
    });

    expect(result.updatedRows).toBe(1);
    expect(new URL(calls[0].url).searchParams.get("valueInputOption")).toBe(
      "USER_ENTERED"
    );
  });
});

describe("calendar", () => {
  it("normalises all-day and timed events to a flat shape", async () => {
    mockFetch(() =>
      jsonReply({
        items: [
          {
            id: "e1",
            summary: "Standup",
            start: { dateTime: "2026-07-27T09:00:00Z" },
            end: { dateTime: "2026-07-27T09:15:00Z" },
            attendees: [{ email: "a@example.com" }, {}]
          },
          {
            id: "e2",
            summary: "Holiday",
            start: { date: "2026-07-28" },
            end: { date: "2026-07-29" }
          }
        ]
      })
    );

    const events = await calendarListEvents(TOKEN);
    expect(events[0].start).toBe("2026-07-27T09:00:00Z");
    expect(events[0].attendees).toEqual(["a@example.com"]);
    expect(events[1].start).toBe("2026-07-28");
    expect(events[1].attendees).toEqual([]);
  });

  it("defaults to the primary calendar when none is given", async () => {
    mockFetch(() => jsonReply({ id: "e1", summary: "Sync" }));
    await calendarCreateEvent(TOKEN, {
      summary: "Sync",
      start: "2026-07-27T15:00:00-07:00",
      end: "2026-07-27T15:30:00-07:00"
    });

    expect(calls[0].url).toContain("/calendars/primary/events");
  });
});
