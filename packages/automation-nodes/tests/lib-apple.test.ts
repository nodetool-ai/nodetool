import { describe, it, expect } from "vitest";
import {
  CreateCalendarEventAppleNode,
  ListCalendarEventsAppleNode,
  CreateNoteAppleNode,
  ListNotesAppleNode,
  CreateReminderAppleNode,
  ListRemindersAppleNode,
  SendMessageAppleNode,
  SendMailAppleNode,
  SearchContactsAppleNode,
  GetFrontSafariTabAppleNode,
  OpenSafariURLAppleNode,
  SafariSelectionTextAppleNode,
  SafariPageTextAppleNode,
  GetClipboardTextAppleNode,
  SetClipboardTextAppleNode,
  SayTextAppleNode,
  PostNotificationAppleNode,
  LIB_APPLE_NODES,
  __testing__
} from "../src/nodes/lib-apple.js";

const {
  escAS,
  parseDateInput,
  asDateExpr,
  parseRecords,
  REC_SEP,
  FIELD_SEP
} = __testing__;

describe("lib.apple helpers", () => {
  it("escapes quotes and backslashes for AppleScript", () => {
    expect(escAS('he said "hi"')).toBe('he said \\"hi\\"');
    expect(escAS("path\\to")).toBe("path\\\\to");
    expect(escAS("")).toBe("");
    expect(escAS(undefined as unknown as string)).toBe("");
  });

  it("escapes newlines and carriage returns to prevent script injection", () => {
    expect(escAS("line1\nline2")).toBe("line1\\nline2");
    expect(escAS("line1\rline2")).toBe("line1\\rline2");
    expect(escAS("a\r\nb")).toBe("a\\r\\nb");
  });

  it("strips null bytes and other ASCII control characters", () => {
    expect(escAS("a\x00b")).toBe("ab");
    expect(escAS("a\x01b\x1fb")).toBe("abb");
    // Tabs are stripped; they are not meaningful in AppleScript string values
    // and the regex intentionally covers 0x00-0x09 (which includes 0x09 tab)
    expect(escAS("a\x09b")).toBe("ab");
    // DEL (0x7F) is stripped
    expect(escAS("a\x7fb")).toBe("ab");
  });

  it("parses Date, number, ISO string, and component object", () => {
    const d = new Date(2024, 0, 15, 10, 30, 0);
    expect(parseDateInput(d).getTime()).toBe(d.getTime());

    const fromNum = parseDateInput(1_700_000_000_000);
    expect(fromNum).toBeInstanceOf(Date);

    const fromIso = parseDateInput("2024-01-15T10:30:00Z");
    expect(fromIso.getUTCFullYear()).toBe(2024);

    const fromObj = parseDateInput({
      year: 2024,
      month: 3,
      day: 5,
      hour: 8,
      minute: 15,
      second: 0
    });
    expect(fromObj.getFullYear()).toBe(2024);
    expect(fromObj.getMonth()).toBe(2);
    expect(fromObj.getDate()).toBe(5);
  });

  it("rejects clearly invalid date input", () => {
    expect(() => parseDateInput("not a date")).toThrow();
    expect(() => parseDateInput({ foo: "bar" } as unknown)).toThrow();
  });

  it("emits AppleScript that sets year/month/day/hours/minutes/seconds", () => {
    const d = new Date(2024, 5, 12, 9, 45, 30);
    const expr = asDateExpr("startDate", d);
    expect(expr).toContain("set startDate to current date");
    // day is set to 1 first to prevent month-overflow (e.g. Feb 31 → March)
    expect(expr).toMatch(/set day of startDate to 1\n/);
    expect(expr).toContain("set year of startDate to 2024");
    expect(expr).toContain("set month of startDate to 6");
    expect(expr).toContain("set day of startDate to 12");
    expect(expr).toContain("set hours of startDate to 9");
    expect(expr).toContain("set minutes of startDate to 45");
    expect(expr).toContain("set seconds of startDate to 30");
  });

  it("round-trips delimited records", () => {
    const stdout =
      `a${FIELD_SEP}b${FIELD_SEP}c${REC_SEP}` +
      `d${FIELD_SEP}e${FIELD_SEP}f${REC_SEP}\n`;
    expect(parseRecords(stdout)).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"]
    ]);
    expect(parseRecords("")).toEqual([]);
  });
});

describe("lib.apple node metadata", () => {
  const cases: Array<[any, string, string]> = [
    [CreateCalendarEventAppleNode, "lib.apple.CreateCalendarEvent", "Create Calendar Event"],
    [ListCalendarEventsAppleNode, "lib.apple.ListCalendarEvents", "List Calendar Events"],
    [CreateNoteAppleNode, "lib.apple.CreateNote", "Create Note"],
    [ListNotesAppleNode, "lib.apple.ListNotes", "List Notes"],
    [CreateReminderAppleNode, "lib.apple.CreateReminder", "Create Reminder"],
    [ListRemindersAppleNode, "lib.apple.ListReminders", "List Reminders"],
    [SendMessageAppleNode, "lib.apple.SendMessage", "Send iMessage"],
    [SendMailAppleNode, "lib.apple.SendMail", "Send Mail (Apple Mail)"],
    [SearchContactsAppleNode, "lib.apple.SearchContacts", "Search Contacts"],
    [GetFrontSafariTabAppleNode, "lib.apple.GetFrontSafariTab", "Get Front Safari Tab"],
    [OpenSafariURLAppleNode, "lib.apple.OpenSafariURL", "Open URL in Safari"],
    [SafariSelectionTextAppleNode, "lib.apple.SafariSelectionText", "Safari Selection Text"],
    [SafariPageTextAppleNode, "lib.apple.SafariPageText", "Safari Page Text"],
    [GetClipboardTextAppleNode, "lib.apple.GetClipboardText", "Get Clipboard Text"],
    [SetClipboardTextAppleNode, "lib.apple.SetClipboardText", "Set Clipboard Text"],
    [SayTextAppleNode, "lib.apple.SayText", "Say Text"],
    [PostNotificationAppleNode, "lib.apple.PostNotification", "Post Notification"]
  ];

  it.each(cases)("%s has stable nodeType and title", (cls, nodeType, title) => {
    expect(cls.nodeType).toBe(nodeType);
    expect(cls.title).toBe(title);
    expect(typeof cls.description).toBe("string");
    expect(cls.description.length).toBeGreaterThan(0);
    expect(cls.metadataOutputTypes).toBeDefined();
  });

  it("registers all nodes in LIB_APPLE_NODES", () => {
    expect(LIB_APPLE_NODES.length).toBe(cases.length);
    const types = new Set(LIB_APPLE_NODES.map((c) => c.nodeType));
    for (const [, t] of cases) {
      expect(types.has(t)).toBe(true);
    }
  });
});

describe("lib.apple platform guard", () => {
  it("throws when osascript runs on a non-darwin platform", async () => {
    if (process.platform === "darwin") return;
    const node = new GetClipboardTextAppleNode();
    await expect(node.process()).rejects.toThrow(/macOS/);
  });
});

describe("lib.apple input validation", () => {
  it("CreateCalendarEvent rejects empty title", async () => {
    const node = new CreateCalendarEventAppleNode();
    (node as any).event_title = "";
    (node as any).start_date = new Date();
    (node as any).end_date = new Date();
    await expect(node.process()).rejects.toThrow(/title/);
  });

  it("SendMessage requires recipient and text", async () => {
    const node = new SendMessageAppleNode();
    (node as any).recipient = "";
    (node as any).text = "hi";
    await expect(node.process()).rejects.toThrow(/recipient/);

    const node2 = new SendMessageAppleNode();
    (node2 as any).recipient = "+15555550100";
    (node2 as any).text = "";
    await expect(node2.process()).rejects.toThrow(/text/);
  });

  it("SendMail requires to_address", async () => {
    const node = new SendMailAppleNode();
    (node as any).to_address = "";
    await expect(node.process()).rejects.toThrow(/to_address/);
  });

  it("CreateReminder requires title", async () => {
    const node = new CreateReminderAppleNode();
    (node as any).title = "";
    await expect(node.process()).rejects.toThrow(/title/);
  });

  it("OpenSafariURL requires url", async () => {
    const node = new OpenSafariURLAppleNode();
    (node as any).url = "";
    await expect(node.process()).rejects.toThrow(/url/);
  });

  it("SayText requires non-empty text", async () => {
    const node = new SayTextAppleNode();
    (node as any).text = "";
    await expect(node.process()).rejects.toThrow(/text/);
  });

  it("CreateNote rejects empty title and body", async () => {
    const node = new CreateNoteAppleNode();
    (node as any).title = "";
    (node as any).body = "";
    await expect(node.process()).rejects.toThrow(/title or body/);
  });
});
