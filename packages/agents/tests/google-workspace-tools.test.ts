import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  GOOGLE_WORKSPACE_TOOL_NAMES,
  getGoogleWorkspaceTools
} from "../src/tools/google-workspace-tools.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

const TOKEN = "ya29.test-token";

let originalFetch: typeof globalThis.fetch;
let requests: string[] = [];

function contextWithToken(token: string | null): ProcessingContext {
  return { getSecret: async () => token } as unknown as ProcessingContext;
}

function mockFetch(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    requests.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
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

describe("Google Workspace toolbelt", () => {
  it("exposes uniquely-named tools across Drive, Gmail, Docs, Sheets and Calendar", () => {
    const names = getGoogleWorkspaceTools().map((t) => t.name);
    expect(names).toHaveLength(GOOGLE_WORKSPACE_TOOL_NAMES.length);
    expect(new Set(names).size).toBe(names.length);
    for (const prefix of [
      "google_drive_",
      "gmail_",
      "google_docs_",
      "google_sheets_",
      "google_calendar_"
    ]) {
      expect(names.some((n) => n.startsWith(prefix))).toBe(true);
    }
  });

  it("builds each name as a tool", () => {
    for (const name of GOOGLE_WORKSPACE_TOOL_NAMES) {
      expect(toolForCapabilityName(name).name).toBe(name);
    }
  });
});

describe("token handling", () => {
  it("returns a sign-in hint instead of throwing when no account is connected", async () => {
    const result = (await toolForCapabilityName("google_drive_search").process(
      contextWithToken(null),
      { query: "notes" }
    )) as { error?: string };

    expect(result.error).toMatch(/Sign in with Google/);
  });

  it("turns a Google API failure into an error result the agent can read", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("insufficient scope", { status: 403 })
    ) as unknown as typeof globalThis.fetch;

    const result = (await toolForCapabilityName("google_drive_search").process(
      contextWithToken(TOKEN),
      { query: "notes" }
    )) as { error?: string };

    expect(result.error).toContain("403");
  });
});

describe("tool calls", () => {
  it("searches Drive and returns the file list", async () => {
    mockFetch({ files: [{ id: "1", name: "Report", mimeType: "text/plain" }] });

    const result = (await toolForCapabilityName("google_drive_search").process(
      contextWithToken(TOKEN),
      { query: "Report", max_results: 5 }
    )) as { files: unknown[] };

    expect(result.files).toHaveLength(1);
    expect(requests[0]).toContain("drive/v3/files");
  });

  it("sends mail through the Gmail send endpoint", async () => {
    mockFetch({ id: "sent-1", threadId: "t1" });

    const result = (await toolForCapabilityName("gmail_send_message").process(
      contextWithToken(TOKEN),
      { to: "bob@example.com", subject: "Hi", body: "there" }
    )) as { id: string };

    expect(result.id).toBe("sent-1");
    expect(requests[0]).toContain("/messages/send");
  });

  it("coerces a flat value list into a single sheet row", async () => {
    mockFetch({ updates: { updatedRange: "A2:B2", updatedRows: 1 } });

    const result = (await toolForCapabilityName("google_sheets_append").process(
      contextWithToken(TOKEN),
      { spreadsheet_id: "s1", range: "A:B", values: ["Alice", 30] }
    )) as { updatedRows: number };

    expect(result.updatedRows).toBe(1);
  });

  it("lists calendar events", async () => {
    mockFetch({
      items: [
        {
          id: "e1",
          summary: "Standup",
          start: { dateTime: "2026-07-27T09:00:00Z" },
          end: { dateTime: "2026-07-27T09:15:00Z" }
        }
      ]
    });

    const result = (await toolForCapabilityName("google_calendar_list_events").process(
      contextWithToken(TOKEN),
      {}
    )) as { events: Array<{ summary: string }> };

    expect(result.events[0].summary).toBe("Standup");
  });
});
