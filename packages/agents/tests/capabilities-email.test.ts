/**
 * The `email` capability module: the three Gmail-over-IMAP capabilities.
 *
 * Clean module walk, category parity with the map the gate reads, deprecated
 * classes that still render their ported specs, and one round trip over a
 * stubbed IMAP client.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  EMAIL_CAPABILITIES,
  module as emailModule
} from "../src/capabilities/email.js";
import type {
  CapabilityExport,
  CapabilityGate
} from "../src/capabilities/types.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import type { Tool } from "../src/tools/base-tool.js";

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  search: vi.fn().mockResolvedValue([]),
  fetch: vi.fn(),
  messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
  messageMove: vi.fn().mockResolvedValue({ path: "[Gmail]/All Mail" })
};

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn(function () {
    return mockClient;
  })
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn().mockResolvedValue({
    subject: "Test Subject",
    from: { text: "sender@example.com" },
    html: "<p>Hello World</p>",
    text: "Hello World"
  })
}));

const gate: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

const context = {
  getSecret: async (key: string) =>
    key === "GOOGLE_MAIL_USER"
      ? "user@gmail.com"
      : key === "GOOGLE_APP_PASSWORD"
        ? "app-password"
        : null
} as unknown as ProcessingContext;

function byName(name: string): CapabilityExport {
  const found = EMAIL_CAPABILITIES.find((entry) => entry.spec.name === name);
  if (!found) throw new Error(`no email capability named ${name}`);
  return found;
}

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, (ctx) =>
    createCapabilityRun({ context: ctx, gate })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.getMailboxLock.mockResolvedValue({ release: vi.fn() });
  mockClient.messageMove.mockResolvedValue({ path: "[Gmail]/All Mail" });
});

describe("email capability module", () => {
  it("loads from the registry with no issues", async () => {
    const loaded = await loadCapabilityModule("email");
    expect(loaded).toBe(emailModule);
    expect(capabilityModuleIssues("email", loaded)).toEqual([]);
  });

  it("classifies every export exactly as the gate's map does", () => {
    for (const entry of EMAIL_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });
});

describe("wire compatibility: a Tool built from the spec", () => {
  const pairs: Array<[Tool, string]> = [
    [toolForCapabilityName("search_email"), "search_email"],
    [toolForCapabilityName("archive_email"), "archive_email"],
    [toolForCapabilityName("add_label_to_email"), "add_label_to_email"]
  ];

  it.each(pairs)("%o keeps its name, description and schema", (tool, name) => {
    const { spec } = byName(name);
    expect(tool.name).toBe(spec.name);
    expect(tool.description).toBe(spec.description);
    expect(tool.inputSchema).toEqual(spec.inputSchema);
  });

  it("keeps the userMessage templates", () => {
    expect(
      toolForCapabilityName("archive_email").userMessage({ message_ids: ["7"] })
    ).toBe("Archiving email 7...");
    expect(
      toolForCapabilityName("add_label_to_email").userMessage({
        message_id: "7",
        label: "todo"
      })
    ).toBe("Adding label 'todo' to email 7...");
  });
});

describe("behaviour through toolFromCapability", () => {
  it("returns nothing when the mailbox has no match", async () => {
    mockClient.search.mockResolvedValue([]);
    const result = await asTool(byName("search_email")).process(context, {
      subject: "invoice"
    });
    expect(result).toEqual([]);
    expect(mockClient.logout).toHaveBeenCalled();
  });

  it("parses the messages search_email fetched", async () => {
    mockClient.search.mockResolvedValue([11]);
    mockClient.fetch.mockImplementation(async function* () {
      yield { uid: 11, source: Buffer.from("raw") };
    });

    const result = (await asTool(byName("search_email")).process(context, {
      subject: "invoice"
    })) as Array<Record<string, string>>;

    expect(result).toEqual([
      {
        message_id: "11",
        subject: "Test Subject",
        sender: "sender@example.com",
        body: "Hello World"
      }
    ]);
  });

  it("archives by moving the message out of the inbox", async () => {
    const result = (await asTool(byName("archive_email")).process(context, {
      message_ids: ["11"]
    })) as { success: boolean; archived_messages: string[] };
    expect(result.archived_messages).toEqual(["11"]);
    expect(mockClient.messageMove).toHaveBeenCalledWith(
      "11",
      "[Gmail]/All Mail",
      { uid: true }
    );
  });

  it("reports a connection failure as an error object", async () => {
    const noSecrets = {
      getSecret: async () => null
    } as unknown as ProcessingContext;
    const result = (await asTool(byName("search_email")).process(
      noSecrets,
      {}
    )) as { error: string };
    expect(result.error).toBe("GOOGLE_MAIL_USER is not set");
  });
});
