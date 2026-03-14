import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
} from "../src/tools/email-tools.js";

// Shared mock client accessible from tests
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  search: vi.fn().mockResolvedValue([]),
  fetch: vi.fn(),
  messageFlagsRemove: vi.fn().mockResolvedValue(undefined),
  messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
};

// Mock imapflow
vi.mock("imapflow", () => {
  return {
    ImapFlow: vi.fn(() => mockClient),
  };
});

// Mock mailparser
vi.mock("mailparser", () => ({
  simpleParser: vi.fn().mockResolvedValue({
    subject: "Test Subject",
    from: { text: "sender@example.com" },
    html: "<p>Hello World</p>",
    text: "Hello World",
  }),
}));

const mockContext = {
  getSecret: vi.fn().mockImplementation((key: string) => {
    if (key === "GOOGLE_MAIL_USER") return Promise.resolve("user@gmail.com");
    if (key === "GOOGLE_APP_PASSWORD") return Promise.resolve("app-password");
    return Promise.resolve(null);
  }),
} as any;


// ---------------------------------------------------------------------------
// SearchEmailTool
// ---------------------------------------------------------------------------

describe("SearchEmailTool", () => {
  const tool = new SearchEmailTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("search_email");
    expect(tool.inputSchema).toHaveProperty("properties");
    expect((tool.inputSchema as any).properties.subject).toBeDefined();
    expect((tool.inputSchema as any).properties.since_hours_ago).toBeDefined();
  });

  it("returns empty array when no messages found", async () => {
    const client = mockClient;
    client.search.mockResolvedValueOnce([]);

    const result = await tool.process(mockContext, {});
    expect(result).toEqual([]);
  });

  it("returns parsed email results", async () => {
    const client = mockClient;
    client.search.mockResolvedValueOnce([101, 102]);

    // Mock the async iterator returned by fetch
    const messages = [
      {
        uid: 102,
        source: Buffer.from("fake email source 1"),
      },
      {
        uid: 101,
        source: Buffer.from("fake email source 2"),
      },
    ];

    client.fetch.mockReturnValueOnce({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: () =>
            i < messages.length
              ? Promise.resolve({ value: messages[i++], done: false })
              : Promise.resolve({ value: undefined, done: true }),
        };
      },
    });

    const result = (await tool.process(mockContext, {
      subject: "Test",
      since_hours_ago: 12,
      max_results: 10,
    })) as any[];

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe("Test Subject");
    expect(result[0].sender).toBe("sender@example.com");
    expect(result[0].body).toContain("Hello World");
  });

  it("returns error when credentials missing", async () => {
    const noCredsContext = {
      getSecret: vi.fn().mockResolvedValue(null),
    } as any;

    // Clear env vars too
    const origUser = process.env.GOOGLE_MAIL_USER;
    const origPass = process.env.GOOGLE_APP_PASSWORD;
    delete process.env.GOOGLE_MAIL_USER;
    delete process.env.GOOGLE_APP_PASSWORD;

    const result = (await tool.process(noCredsContext, {})) as any;
    expect(result.error).toMatch(/GOOGLE_MAIL_USER/);

    // Restore
    if (origUser) process.env.GOOGLE_MAIL_USER = origUser;
    if (origPass) process.env.GOOGLE_APP_PASSWORD = origPass;
  });

  it("userMessage formats with subject", () => {
    const msg = tool.userMessage({ subject: "Test" });
    expect(msg).toContain("subject: 'Test'");
  });

  it("userMessage falls back to generic message", () => {
    const msg = tool.userMessage({});
    expect(msg).toBe("Searching emails...");
  });

  it("userMessage truncates long messages", () => {
    const msg = tool.userMessage({
      subject: "A".repeat(100),
      text: "B".repeat(100),
    });
    expect(msg).toBe("Searching emails...");
  });

  it("produces valid provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("search_email");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ArchiveEmailTool
// ---------------------------------------------------------------------------

describe("ArchiveEmailTool", () => {
  const tool = new ArchiveEmailTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("archive_email");
    expect((tool.inputSchema as any).required).toContain("message_ids");
  });

  it("archives messages successfully", async () => {
    const result = (await tool.process(mockContext, {
      message_ids: ["1", "2"],
    })) as any;

    expect(result.success).toBe(true);
    expect(result.archived_messages).toEqual(["1", "2"]);
  });

  it("handles string message_ids (single)", async () => {
    const result = (await tool.process(mockContext, {
      message_ids: "42",
    })) as any;

    expect(result.success).toBe(true);
    expect(result.archived_messages).toEqual(["42"]);
  });

  it("handles failed archive operations gracefully", async () => {
    const client = mockClient;
    client.messageFlagsRemove.mockRejectedValueOnce(
      new Error("Message not found"),
    );

    const result = (await tool.process(mockContext, {
      message_ids: ["bad-id", "good-id"],
    })) as any;

    expect(result.success).toBe(true);
    // First one fails, second one succeeds
    expect(result.archived_messages).toEqual(["good-id"]);
  });

  it("userMessage for single message", () => {
    expect(tool.userMessage({ message_ids: ["123"] })).toBe(
      "Archiving email 123...",
    );
  });

  it("userMessage for multiple messages", () => {
    expect(tool.userMessage({ message_ids: ["1", "2", "3"] })).toBe(
      "Archiving 3 emails...",
    );
  });
});

// ---------------------------------------------------------------------------
// AddLabelToEmailTool
// ---------------------------------------------------------------------------

describe("AddLabelToEmailTool", () => {
  const tool = new AddLabelToEmailTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and schema", () => {
    expect(tool.name).toBe("add_label_to_email");
    expect((tool.inputSchema as any).required).toContain("message_id");
    expect((tool.inputSchema as any).required).toContain("label");
  });

  it("adds label successfully", async () => {
    const result = (await tool.process(mockContext, {
      message_id: "42",
      label: "Important",
    })) as any;

    expect(result.success).toBe(true);
    expect(result.message_id).toBe("42");
    expect(result.label).toBe("Important");
  });

  it("returns error on failure", async () => {
    const client = mockClient;
    client.messageFlagsAdd.mockRejectedValueOnce(new Error("IMAP error"));

    const result = (await tool.process(mockContext, {
      message_id: "42",
      label: "Important",
    })) as any;

    expect(result.error).toMatch(/IMAP error/);
  });

  it("userMessage formats correctly", () => {
    expect(
      tool.userMessage({ message_id: "42", label: "Work" }),
    ).toBe("Adding label 'Work' to email 42...");
  });

  it("userMessage truncates long messages", () => {
    const msg = tool.userMessage({
      message_id: "A".repeat(100),
      label: "Work",
    });
    expect(msg).toBe("Adding label 'Work' to email...");
  });
});
