/**
 * lib.mail.* talk to Gmail over IMAP. `imapflow` is replaced by an in-memory
 * mailbox, so no test opens a socket. The fake follows the parts of the real
 * client the nodes depend on:
 *
 * - `search` and `fetch` answer in ascending UID order, whatever was asked.
 * - `search` ignores `since`. Real IMAP compares calendar days, so the server
 *   returns the whole day for "since one hour". The fake is as coarse as that
 *   worst case, and the node has to filter by the message's own date.
 * - `messageMove` and `messageCopy` resolve to `false` when nothing happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  ALL_INTEGRATION_NODES,
  AddLabelLibNode,
  GmailSearchLibNode,
  LIB_MAIL_NODES,
  MoveToArchiveLibNode,
  registerIntegrationNodes
} from "@nodetool-ai/integration-nodes";

interface StoredMessage {
  uid: number;
  /** When the server received it. The Date header (`date`) is the sender's claim. */
  internalDate?: Date;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  source: string;
}

type Call = [string, ...unknown[]];

const imap = vi.hoisted(() => ({
  messages: [] as StoredMessage[],
  clients: [] as Array<{
    options: Record<string, unknown>;
    listeners: string[];
    calls: Array<[string, ...unknown[]]>;
    loggedOut: boolean;
  }>,
  mailboxes: [] as Array<{ path: string; specialUse?: string }>,
  connectError: null as Error | null,
  searchError: null as Error | null,
  logoutError: null as Error | null,
  copyResult: true as boolean,
  moveResult: true as boolean
}));

vi.mock("imapflow", () => {
  class ImapFlow {
    options: Record<string, unknown>;
    listeners: string[] = [];
    calls: Call[] = [];
    loggedOut = false;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      imap.clients.push(this);
    }

    on(event: string): this {
      this.listeners.push(event);
      return this;
    }

    async connect(): Promise<void> {
      if (imap.connectError) throw imap.connectError;
    }

    async list(): Promise<Array<{ path: string; specialUse?: string }>> {
      this.calls.push(["list"]);
      return imap.mailboxes;
    }

    async getMailboxLock(folder: string): Promise<{ release(): void }> {
      this.calls.push(["lock", folder]);
      return { release: () => this.calls.push(["release", folder]) };
    }

    async search(
      query: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<number[]> {
      this.calls.push(["search", query, options]);
      if (imap.searchError) throw imap.searchError;
      const header = query.header as Record<string, string> | undefined;
      const contains = (value: string, needle: unknown): boolean =>
        value.toLowerCase().includes(String(needle).toLowerCase());
      const mailbox = [...imap.messages].sort((a, b) => a.uid - b.uid);
      // Without `{ uid: true }` a real server answers with positions, which
      // shift when mail arrives or is removed.
      const idOf = (m: StoredMessage): number =>
        options?.uid ? m.uid : mailbox.indexOf(m) + 1;
      return mailbox
        .filter((m) => {
          if (header?.["message-id"]) return m.messageId === header["message-id"];
          if (query.from && !contains(m.from, query.from)) return false;
          if (query.to && !contains(m.to, query.to)) return false;
          if (query.subject && !contains(m.subject, query.subject)) return false;
          if (query.body && !contains(m.source, query.body)) return false;
          if (query.text && !contains(m.source, query.text)) return false;
          return true;
        })
        .map(idOf);
    }

    async *fetch(
      range: string,
      query: Record<string, unknown>,
      options: Record<string, unknown>
    ): AsyncGenerator<Record<string, unknown>> {
      this.calls.push(["fetch", range, query, options]);
      const wanted = new Set(range.split(",").map(Number));
      for (const m of [...imap.messages].sort((a, b) => a.uid - b.uid)) {
        if (!wanted.has(m.uid)) continue;
        yield {
          uid: m.uid,
          envelope: {
            subject: m.subject,
            from: [{ address: m.from }],
            to: [{ address: m.to }],
            date: m.date,
            messageId: m.messageId
          },
          internalDate: m.internalDate ?? m.date,
          source: Buffer.from(m.source)
        };
      }
    }

    async messageCopy(...args: unknown[]): Promise<unknown> {
      this.calls.push(["copy", ...args]);
      return imap.copyResult ? { path: "INBOX", destination: args[1] } : false;
    }

    async messageMove(...args: unknown[]): Promise<unknown> {
      this.calls.push(["move", ...args]);
      return imap.moveResult ? { path: "INBOX", destination: args[1] } : false;
    }

    async logout(): Promise<void> {
      this.loggedOut = true;
      if (imap.logoutError) throw imap.logoutError;
    }
  }
  return { ImapFlow };
});

const SECRETS = {
  GOOGLE_MAIL_USER: "me@gmail.com",
  GOOGLE_APP_PASSWORD: "app-password"
};

const HOUR = 60 * 60 * 1000;

/** Gmail names its system folders per account language, but the role is fixed. */
const ENGLISH_ACCOUNT = [
  { path: "INBOX" },
  { path: "[Gmail]/All Mail", specialUse: "\\All" },
  { path: "[Gmail]/Drafts", specialUse: "\\Drafts" },
  { path: "[Gmail]/Sent Mail", specialUse: "\\Sent" },
  { path: "[Gmail]/Spam", specialUse: "\\Junk" },
  { path: "[Gmail]/Trash", specialUse: "\\Trash" }
];
const GERMAN_ACCOUNT = [
  { path: "INBOX" },
  { path: "[Google Mail]/Alle Nachrichten", specialUse: "\\All" },
  { path: "[Google Mail]/Entwürfe", specialUse: "\\Drafts" },
  { path: "[Google Mail]/Gesendet", specialUse: "\\Sent" },
  { path: "[Google Mail]/Spam", specialUse: "\\Junk" },
  { path: "[Google Mail]/Papierkorb", specialUse: "\\Trash" }
];

function rfc822(headers: string[], body: string[]): string {
  return [...headers, "", ...body].join("\r\n");
}

/** multipart/alternative: a quoted-printable text part and an HTML part. */
const MULTIPART = rfc822(
  [
    "From: Alice <alice@example.com>",
    "To: me@gmail.com",
    "Subject: Invoice",
    "Message-ID: <multipart@example.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="b1"'
  ],
  [
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Gr=C3=BC=C3=9Fe from the invoice=",
    " desk",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Gr&uuml;&szlig;e from the invoice desk</p>",
    "--b1--",
    ""
  ]
);

const HTML_ONLY_HTML =
  "<html><body><h1>Receipt</h1><p>Total: <b>42 EUR</b></p></body></html>";

/** A base64 HTML-only message with no text part. */
const HTML_ONLY = rfc822(
  [
    "From: Shop <shop@example.com>",
    "To: me@gmail.com",
    "Subject: Receipt",
    "Message-ID: <html@example.com>",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64"
  ],
  [Buffer.from(HTML_ONLY_HTML).toString("base64"), ""]
);

const PLAIN = rfc822(
  [
    "From: Bob <bob@example.com>",
    "To: me@gmail.com",
    "Subject: Lunch",
    "Message-ID: <plain@example.com>",
    "Content-Type: text/plain; charset=utf-8"
  ],
  ["Noon at the usual place?", ""]
);

function message(
  uid: number,
  overrides: Partial<StoredMessage> = {}
): StoredMessage {
  return {
    uid,
    messageId: `<m${uid}@example.com>`,
    subject: `Subject ${uid}`,
    from: "sender@example.com",
    to: "me@gmail.com",
    // UIDs grow with arrival, so a higher UID is a newer message.
    date: new Date(Date.now() - (60 - uid) * 1000),
    source: PLAIN,
    ...overrides
  };
}

/** Hand a node the secrets the framework resolves from `requiredSettings`. */
function withSecrets<T extends { setDynamic(key: string, value: unknown): void }>(
  node: T,
  secrets: Record<string, string> = SECRETS
): T {
  node.setDynamic("_secrets", secrets);
  return node;
}

function searchNode(props: Record<string, unknown> = {}): GmailSearchLibNode {
  return withSecrets(new GmailSearchLibNode(props));
}

function lastClient() {
  const client = imap.clients.at(-1);
  if (!client) throw new Error("No IMAP client was created");
  return client;
}

function callsNamed(name: string): Call[] {
  return lastClient().calls.filter((call) => call[0] === name);
}

beforeEach(() => {
  imap.messages = [];
  imap.clients = [];
  imap.mailboxes = ENGLISH_ACCOUNT;
  imap.connectError = null;
  imap.searchError = null;
  imap.logoutError = null;
  imap.copyResult = true;
  imap.moveResult = true;
});

describe("lib.mail registration", () => {
  it("declares the retired node types, so saved workflows resolve again", () => {
    expect(GmailSearchLibNode.nodeType).toBe("lib.mail.GmailSearch");
    expect(AddLabelLibNode.nodeType).toBe("lib.mail.AddLabel");
    expect(MoveToArchiveLibNode.nodeType).toBe("lib.mail.MoveToArchive");
    expect(LIB_MAIL_NODES).toHaveLength(3);
  });

  it("registers all three through registerIntegrationNodes", () => {
    const registry = new NodeRegistry();
    registerIntegrationNodes(registry);
    for (const type of [
      "lib.mail.GmailSearch",
      "lib.mail.AddLabel",
      "lib.mail.MoveToArchive"
    ]) {
      expect(registry.has(type)).toBe(true);
    }
    for (const node of LIB_MAIL_NODES) {
      expect(ALL_INTEGRATION_NODES).toContain(node);
    }
  });

  it("asks for the mail settings of the Gmail app password", () => {
    for (const node of LIB_MAIL_NODES) {
      expect(node.requiredSettings).toEqual([
        "GOOGLE_MAIL_USER",
        "GOOGLE_APP_PASSWORD"
      ]);
    }
  });

  it("returns only declared output slots", async () => {
    imap.messages = [message(1)];
    // A key that is not a declared slot has no handle in the editor, so the
    // value would never reach a downstream node.
    const declared = (node: { metadataOutputTypes: Record<string, string> }) =>
      Object.keys(node.metadataOutputTypes);

    const searched = await searchNode().process();
    expect(declared(GmailSearchLibNode)).toEqual(
      expect.arrayContaining(Object.keys(searched))
    );
    const streamed: string[] = [];
    for await (const item of searchNode().genProcess()) {
      streamed.push(...Object.keys(item));
    }
    expect(new Set(streamed)).toEqual(new Set(declared(GmailSearchLibNode)));

    const label = await withSecrets(
      new AddLabelLibNode({ message_id: "<m1@example.com>", label: "Receipts" })
    ).process();
    expect(Object.keys(label)).toEqual(declared(AddLabelLibNode));

    const archived = await withSecrets(
      new MoveToArchiveLibNode({ message_id: "<m1@example.com>" })
    ).process();
    expect(Object.keys(archived)).toEqual(declared(MoveToArchiveLibNode));
  });
});

describe("lib.mail.GmailSearch", () => {
  it("connects to Gmail over TLS with the app password", async () => {
    await searchNode().process();
    expect(lastClient().options).toMatchObject({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: "me@gmail.com", pass: "app-password" }
    });
  });

  it("refuses to connect without credentials", async () => {
    await expect(new GmailSearchLibNode({}).process()).rejects.toThrow(
      "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings."
    );
    await expect(
      withSecrets(new GmailSearchLibNode({}), {
        GOOGLE_MAIL_USER: "me@gmail.com"
      }).process()
    ).rejects.toThrow("GOOGLE_APP_PASSWORD");
    expect(imap.clients).toHaveLength(0);
  });

  it("sends every filled filter to the server and leaves empty ones out", async () => {
    imap.messages = [message(1)];
    await searchNode({
      from_address: "alice@example.com",
      to_address: "me@gmail.com",
      subject: "Invoice",
      body: "total",
      text: "anywhere",
      keywords: "Receipts",
      date_filter: "SINCE_ONE_WEEK",
      folder: "[Gmail]/Sent Mail"
    }).process();

    const [, query, options] = callsNamed("search")[0];
    expect(query).toMatchObject({
      from: "alice@example.com",
      to: "me@gmail.com",
      subject: "Invoice",
      body: "total",
      text: "anywhere",
      labels: { has: ["Receipts"] }
    });
    expect(query).not.toHaveProperty("keyword");
    expect((query as { since: Date }).since).toBeInstanceOf(Date);
    expect(options).toEqual({ uid: true });
    expect(callsNamed("lock")[0][1]).toBe("[Gmail]/Sent Mail");

    imap.clients = [];
    await searchNode().process();
    const [, bare] = callsNamed("search")[0];
    expect(Object.keys(bare as object)).toEqual(["since"]);
  });

  it.each([
    ["[Gmail]/Sent Mail", "[Google Mail]/Gesendet"],
    ["[Gmail]/Drafts", "[Google Mail]/Entwürfe"],
    ["[Gmail]/Spam", "[Google Mail]/Spam"],
    ["[Gmail]/Trash", "[Google Mail]/Papierkorb"]
  ])(
    "opens %s under the name a German account gives it",
    async (folder, expected) => {
      imap.mailboxes = GERMAN_ACCOUNT;
      await searchNode({ folder }).process();
      expect(callsNamed("lock")[0][1]).toBe(expected);
    }
  );

  it("opens INBOX without listing the account's folders", async () => {
    imap.mailboxes = GERMAN_ACCOUNT;
    await searchNode().process();
    expect(callsNamed("list")).toHaveLength(0);
    expect(callsNamed("lock")[0][1]).toBe("INBOX");
  });

  it("keeps the given folder path when the account lists no folder with that role", async () => {
    imap.mailboxes = [{ path: "INBOX" }];
    await searchNode({ folder: "[Gmail]/Trash" }).process();
    expect(callsNamed("lock")[0][1]).toBe("[Gmail]/Trash");
  });

  it("releases the mailbox lock and logs out", async () => {
    await searchNode().process();
    expect(callsNamed("release")).toHaveLength(1);
    expect(lastClient().loggedOut).toBe(true);
  });

  it("listens for client errors, which would otherwise crash the process", async () => {
    await searchNode().process();
    expect(lastClient().listeners).toContain("error");
  });

  it("decodes multipart quoted-printable mail into readable text", async () => {
    imap.messages = [message(1, { source: MULTIPART })];
    const result = await searchNode().process();
    expect(result.body).toContain("Grüße from the invoice desk");
    expect(result.body).not.toMatch(/Content-Type|=C3|boundary|<p>/);
  });

  it("turns an HTML-only message into text", async () => {
    imap.messages = [message(1, { source: HTML_ONLY })];
    const result = await searchNode().process();
    expect(String(result.body)).toMatch(/receipt/i);
    expect(result.body).toContain("42 EUR");
    expect(result.body).not.toMatch(/[<>]|base64|PGh0bWw/);
  });

  it("cuts a long body at 10,000 characters", async () => {
    const long = rfc822(
      ["Subject: Long", "Message-ID: <long@example.com>"],
      ["x".repeat(25_000), ""]
    );
    imap.messages = [message(1, { source: long })];
    const result = await searchNode().process();
    expect(String(result.body)).toHaveLength(10_000);
  });

  it("returns the newest mail first and keeps the newest when it cuts", async () => {
    imap.messages = [1, 2, 3, 4, 5].map((uid) =>
      message(uid, { date: new Date(Date.now() - (6 - uid) * 60_000) })
    );
    const result = await searchNode({ max_results: 2 }).process();
    expect(result.message_ids).toEqual(["<m5@example.com>", "<m4@example.com>"]);
    expect((result.emails as Array<{ subject: string }>).map((e) => e.subject)).toEqual([
      "Subject 5",
      "Subject 4"
    ]);
    // It asked the server for the two newest UIDs, not for all five.
    expect(callsNamed("fetch")[0][1]).toBe("5,4");
  });

  it("applies the date filter to each message, not only to the server's day", async () => {
    imap.messages = [
      message(1, { date: new Date(Date.now() - 2 * 24 * HOUR) }),
      message(2, { date: new Date(Date.now() - 3 * HOUR) }),
      message(3, { date: new Date(Date.now() - 30 * 60_000) })
    ];
    const hour = await searchNode({ date_filter: "SINCE_ONE_HOUR" }).process();
    expect(hour.message_ids).toEqual(["<m3@example.com>"]);

    const day = await searchNode({ date_filter: "SINCE_ONE_DAY" }).process();
    expect(day.message_ids).toEqual(["<m3@example.com>", "<m2@example.com>"]);

    const week = await searchNode({ date_filter: "SINCE_ONE_WEEK" }).process();
    expect(week.message_ids).toEqual([
      "<m3@example.com>",
      "<m2@example.com>",
      "<m1@example.com>"
    ]);
  });

  it("keeps a message whose Date header is missing", async () => {
    imap.messages = [message(1, { date: undefined as unknown as Date })];
    const result = await searchNode({ date_filter: "SINCE_ONE_HOUR" }).process();
    expect(result.message_ids).toEqual(["<m1@example.com>"]);
  });

  it("keeps a message whose Date header does not parse, with an empty date", async () => {
    // ImapFlow hands back the raw header text when it cannot parse the date.
    imap.messages = [
      message(1, { date: "sometime last tuesday" as unknown as Date })
    ];
    const result = await searchNode({ date_filter: "SINCE_ONE_HOUR" }).process();
    expect(result.message_ids).toEqual(["<m1@example.com>"]);
    expect(result.date).toBe("");
  });

  it("reports the date of a message as an ISO timestamp", async () => {
    const sent = new Date(Date.now() - 5 * 60_000);
    imap.messages = [message(1, { date: sent })];
    const result = await searchNode().process();
    expect(result.date).toBe(sent.toISOString());
  });

  it("searches several Gmail labels at once, trimming each", async () => {
    imap.messages = [message(1)];
    await searchNode({ keywords: " Receipts , Travel ,, " }).process();
    const [, query] = callsNamed("search")[0];
    expect((query as { labels: unknown }).labels).toEqual({
      has: ["Receipts", "Travel"]
    });
  });

  it("sends no label filter for a blank keywords field", async () => {
    imap.messages = [message(1)];
    await searchNode({ keywords: "  ,  " }).process();
    const [, query] = callsNamed("search")[0];
    expect(query).not.toHaveProperty("labels");
  });

  it("filters by arrival time, so a stale Date header cannot hide recent mail", async () => {
    // UID 101 arrived a minute ago with a Date header from three days ago, as
    // mail that sat in a queue does. With max_results 1 the newest match is
    // 101, and judging it by its header would return nothing at all.
    imap.messages = [
      message(100, { date: new Date(Date.now() - 2 * 60_000) }),
      message(101, {
        date: new Date(Date.now() - 3 * 24 * HOUR),
        internalDate: new Date(Date.now() - 60_000)
      })
    ];
    const result = await searchNode({
      date_filter: "SINCE_ONE_HOUR",
      max_results: 1
    }).process();
    expect(result.message_ids).toEqual(["<m101@example.com>"]);
  });

  it("drops mail that arrived before the window even when its Date header is recent", async () => {
    imap.messages = [
      message(1, {
        date: new Date(Date.now() - 60_000),
        internalDate: new Date(Date.now() - 3 * HOUR)
      })
    ];
    const result = await searchNode({ date_filter: "SINCE_ONE_HOUR" }).process();
    expect(result.message_ids).toEqual([]);
  });

  it("asks the server for each message's arrival time", async () => {
    imap.messages = [message(1)];
    await searchNode().process();
    expect(callsNamed("fetch")[0][2]).toMatchObject({ internalDate: true });
  });

  it("returns empty outputs when nothing matches", async () => {
    const result = await searchNode().process();
    expect(result).toMatchObject({
      email: {},
      message_id: "",
      subject: "",
      emails: [],
      message_ids: []
    });
    expect(callsNamed("fetch")).toHaveLength(0);
  });

  it("streams one item per email, then the collected lists", async () => {
    imap.messages = [
      message(1, { subject: "First", from: "a@example.com" }),
      message(2, { subject: "Second", from: "b@example.com" })
    ];
    const items: Array<Record<string, unknown>> = [];
    for await (const item of searchNode().genProcess()) items.push(item);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      subject: "Second",
      sender: "b@example.com",
      message_id: "<m2@example.com>"
    });
    expect(items[1]).toMatchObject({ subject: "First" });
    expect(items[2]).toMatchObject({
      message_ids: ["<m2@example.com>", "<m1@example.com>"]
    });
    expect(items[2].emails).toHaveLength(2);
  });

  it("logs out when the search fails and reports the search error", async () => {
    imap.searchError = new Error("Command failed");
    await expect(searchNode().process()).rejects.toThrow("Command failed");
    expect(lastClient().loggedOut).toBe(true);
    expect(callsNamed("release")).toHaveLength(1);
  });

  it("does not let a failing logout replace the original error", async () => {
    imap.searchError = new Error("Command failed");
    imap.logoutError = new Error("socket closed");
    await expect(searchNode().process()).rejects.toThrow("Command failed");
  });

  it("reports a failed login", async () => {
    imap.connectError = new Error("Invalid credentials (Failure)");
    await expect(searchNode().process()).rejects.toThrow("Invalid credentials");
  });
});

describe("lib.mail.AddLabel", () => {
  const labelNode = (props: Record<string, unknown> = {}) =>
    withSecrets(
      new AddLabelLibNode({
        message_id: "<m20@example.com>",
        label: "Receipts",
        ...props
      })
    );

  // UIDs 10 and 20 sit at positions 1 and 2, so a command that mixes the two
  // up acts on the wrong message.
  beforeEach(() => {
    imap.messages = [message(10), message(20)];
  });

  it("copies the message into the label folder by UID", async () => {
    const result = await labelNode().process();
    expect(result).toEqual({ output: true });

    expect(callsNamed("lock")[0][1]).toBe("INBOX");
    expect(callsNamed("search")[0].slice(1)).toEqual([
      { header: { "message-id": "<m20@example.com>" } },
      { uid: true }
    ]);
    expect(callsNamed("copy")[0].slice(1)).toEqual([
      [20],
      "Receipts",
      { uid: true }
    ]);
    expect(callsNamed("release")).toHaveLength(1);
    expect(lastClient().loggedOut).toBe(true);
  });

  it("fails when no message has that Message-ID", async () => {
    await expect(
      labelNode({ message_id: "<missing@example.com>" }).process()
    ).rejects.toThrow("Message not found: <missing@example.com>");
    expect(callsNamed("copy")).toHaveLength(0);
    expect(lastClient().loggedOut).toBe(true);
  });

  it("requires a message id and a label before connecting", async () => {
    await expect(labelNode({ message_id: "" }).process()).rejects.toThrow(
      "Message ID is required"
    );
    await expect(labelNode({ label: "" }).process()).rejects.toThrow(
      "Label is required"
    );
    expect(imap.clients).toHaveLength(0);
  });

  it("reports false when the server did not copy the message", async () => {
    imap.copyResult = false;
    expect(await labelNode().process()).toEqual({ output: false });
  });

  it("refuses to connect without credentials", async () => {
    await expect(
      new AddLabelLibNode({ message_id: "<m2@example.com>", label: "x" }).process()
    ).rejects.toThrow("GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD");
  });
});

describe("lib.mail.MoveToArchive", () => {
  const archiveNode = (props: Record<string, unknown> = {}) =>
    withSecrets(
      new MoveToArchiveLibNode({ message_id: "<m20@example.com>", ...props })
    );

  beforeEach(() => {
    imap.messages = [message(10), message(20)];
  });

  it("moves the message to All Mail by UID", async () => {
    const result = await archiveNode().process();
    expect(result).toEqual({ output: true });
    expect(callsNamed("search")[0][2]).toEqual({ uid: true });
    expect(callsNamed("move")[0].slice(1)).toEqual([
      [20],
      "[Gmail]/All Mail",
      { uid: true }
    ]);
    expect(callsNamed("release")).toHaveLength(1);
    expect(lastClient().loggedOut).toBe(true);
  });

  it("moves to the All Mail folder under the name a German account gives it", async () => {
    imap.mailboxes = GERMAN_ACCOUNT;
    await archiveNode().process();
    expect(callsNamed("move")[0][2]).toBe("[Google Mail]/Alle Nachrichten");
  });

  it("keeps [Gmail]/All Mail when the account lists no All Mail role", async () => {
    imap.mailboxes = [{ path: "INBOX" }];
    await archiveNode().process();
    expect(callsNamed("move")[0][2]).toBe("[Gmail]/All Mail");
  });

  it("reports false when the server moved nothing", async () => {
    imap.moveResult = false;
    expect(await archiveNode().process()).toEqual({ output: false });
  });

  it("fails when no message has that Message-ID", async () => {
    await expect(
      archiveNode({ message_id: "<missing@example.com>" }).process()
    ).rejects.toThrow("Message not found: <missing@example.com>");
    expect(callsNamed("move")).toHaveLength(0);
  });

  it("requires a message id before connecting", async () => {
    await expect(archiveNode({ message_id: "" }).process()).rejects.toThrow(
      "Message ID is required"
    );
    expect(imap.clients).toHaveLength(0);
  });
});
