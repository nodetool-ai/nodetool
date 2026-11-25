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
 * - `search` with a `uid` range "N:*" answers like a real server: the messages
 *   from N up, and the newest message alone when none reach N. A poll that
 *   trusts the range returns that newest message on every check.
 * - `client.mailbox` carries the folder's UIDVALIDITY and next UID, which is
 *   what the trigger's cursor is built from.
 *
 * `nodemailer` is replaced the same way, so no test opens an SMTP connection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  ALL_INTEGRATION_NODES,
  AddLabelLibNode,
  GmailSearchLibNode,
  EmailTriggerLibNode,
  LIB_MAIL_NODES,
  MoveToArchiveLibNode,
  SendEmailLibNode,
  registerIntegrationNodes
} from "@nodetool-ai/integration-nodes";
import { TRIGGER_KIND_BY_NODE_TYPE } from "@nodetool-ai/protocol";

interface StoredMessage {
  uid: number;
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
  moveResult: true as boolean,
  uidValidity: 1n as bigint,
  /** UIDs a concurrent client expunges right after the next search answers. */
  expungeAfterSearch: [] as number[]
}));

const smtp = vi.hoisted(() => ({
  transports: [] as Array<{
    options: Record<string, unknown>;
    sent: Array<Record<string, unknown>>;
    closed: boolean;
  }>,
  sendError: null as Error | null,
  rejected: [] as string[]
}));

vi.mock("nodemailer", () => ({
  createTransport: (options: Record<string, unknown>) => {
    const transport = {
      options,
      sent: [] as Array<Record<string, unknown>>,
      closed: false,
      async sendMail(message: Record<string, unknown>) {
        transport.sent.push(message);
        if (smtp.sendError) throw smtp.sendError;
        const all = ["to", "cc", "bcc"].flatMap(
          (field) => (message[field] as string[] | undefined) ?? []
        );
        return {
          messageId: "<sent-1@gmail.com>",
          accepted: all.filter((a) => !smtp.rejected.includes(a)),
          rejected: smtp.rejected
        };
      },
      close() {
        transport.closed = true;
      }
    };
    smtp.transports.push(transport);
    return transport;
  }
}));

vi.mock("imapflow", () => {
  class ImapFlow {
    options: Record<string, unknown>;
    listeners: string[] = [];
    calls: Call[] = [];
    loggedOut = false;
    mailbox: { uidValidity: bigint; uidNext: number } | false = false;

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
      this.mailbox = {
        uidValidity: imap.uidValidity,
        uidNext: Math.max(0, ...imap.messages.map((m) => m.uid)) + 1
      };
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
      const range = typeof query.uid === "string" ? query.uid : undefined;
      const from = range ? Number(range.split(":")[0]) : 0;
      let inRange = mailbox;
      if (range) {
        inRange = mailbox.filter((m) => m.uid >= from);
        // The server's answer to "N:*" when nothing reaches N.
        if (inRange.length === 0 && mailbox.length > 0) {
          inRange = [mailbox[mailbox.length - 1]];
        }
      }
      const answer = inRange
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
      imap.messages = imap.messages.filter(
        (m) => !imap.expungeAfterSearch.includes(m.uid)
      );
      imap.expungeAfterSearch = [];
      return answer;
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

function sendNode(props: Record<string, unknown> = {}): SendEmailLibNode {
  return withSecrets(
    new SendEmailLibNode({
      to: "ada@example.com",
      subject: "Hello",
      text: "Body",
      ...props
    })
  );
}

function triggerNode(props: Record<string, unknown> = {}): EmailTriggerLibNode {
  return withSecrets(new EmailTriggerLibNode(props));
}

function mailEventPayload(): Record<string, unknown> {
  return {
    source: "email",
    event_type: "new_mail",
    email: {
      subject: "Invoice",
      from: "alice@example.com",
      to: "me@gmail.com",
      date: "2026-01-01T00:00:00.000Z",
      message_id: "<a@example.com>",
      body: "Please pay"
    }
  };
}

/** One poll, as the host makes it. */
function poll(
  cursor: string | null,
  properties: Record<string, unknown> = {},
  secrets: Record<string, string> = SECRETS
) {
  return EmailTriggerLibNode.pollTrigger({ properties, cursor, secrets });
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
  imap.uidValidity = 1n;
  imap.expungeAfterSearch = [];
  smtp.transports = [];
  smtp.sendError = null;
  smtp.rejected = [];
});

describe("lib.mail registration", () => {
  it("declares the retired node types, so saved workflows resolve again", () => {
    expect(GmailSearchLibNode.nodeType).toBe("lib.mail.GmailSearch");
    expect(AddLabelLibNode.nodeType).toBe("lib.mail.AddLabel");
    expect(MoveToArchiveLibNode.nodeType).toBe("lib.mail.MoveToArchive");
    expect(SendEmailLibNode.nodeType).toBe("lib.mail.SendEmail");
    expect(EmailTriggerLibNode.nodeType).toBe("lib.mail.EmailTrigger");
    expect(LIB_MAIL_NODES).toHaveLength(5);
  });

  it("registers every mail node through registerIntegrationNodes", () => {
    const registry = new NodeRegistry();
    registerIntegrationNodes(registry);
    for (const type of [
      "lib.mail.GmailSearch",
      "lib.mail.AddLabel",
      "lib.mail.MoveToArchive",
      "lib.mail.SendEmail",
      "lib.mail.EmailTrigger"
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

    const sent = await sendNode().process();
    expect(Object.keys(sent)).toEqual(declared(SendEmailLibNode));

    // A trigger emits its slots from `emitTriggerEvent`, so the run has to
    // populate every one of them and nothing else.
    const emitted: string[] = [];
    await triggerNode().emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: mailEventPayload() },
      { emit: async (key: string) => void emitted.push(key) } as never
    );
    expect(emitted).toEqual(declared(EmailTriggerLibNode));
    const live: string[] = [];
    for await (const item of triggerNode().genProcess()) {
      live.push(...Object.keys(item));
    }
    expect(new Set(live)).toEqual(new Set(declared(EmailTriggerLibNode)));
  });

  it("classifies sending as an external effect and compiles the trigger to a schedule", () => {
    expect(SendEmailLibNode.effect).toBe("external");
    expect(EmailTriggerLibNode.isTrigger).toBe(true);
    expect(TRIGGER_KIND_BY_NODE_TYPE["lib.mail.EmailTrigger"]).toBe("schedule");
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
      keyword: "Receipts"
    });
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

describe("lib.mail.SendEmail", () => {
  it("sends over SMTP with TLS and the app password, and returns the message id", async () => {
    const result = await sendNode({
      cc: "bob@example.com",
      bcc: "carol@example.com",
      html: "<p>Body</p>"
    }).process();

    expect(result).toEqual({
      message_id: "<sent-1@gmail.com>",
      accepted: ["ada@example.com", "bob@example.com", "carol@example.com"],
      rejected: []
    });
    const [transport] = smtp.transports;
    expect(transport.options).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "me@gmail.com", pass: "app-password" }
    });
    expect(transport.sent).toEqual([
      {
        from: "me@gmail.com",
        to: ["ada@example.com"],
        cc: ["bob@example.com"],
        bcc: ["carol@example.com"],
        subject: "Hello",
        text: "Body",
        html: "<p>Body</p>"
      }
    ]);
    expect(transport.closed).toBe(true);
  });

  it("accepts several recipients separated by commas or semicolons", async () => {
    await sendNode({ to: "a@example.com, b@example.com;c@example.com" }).process();
    expect(smtp.transports[0].sent[0].to).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com"
    ]);
  });

  it("sends an HTML-only message and a text-only message", async () => {
    await sendNode({ text: "", html: "<b>hi</b>" }).process();
    expect(smtp.transports[0].sent[0]).toMatchObject({
      text: undefined,
      html: "<b>hi</b>"
    });
    await sendNode().process();
    expect(smtp.transports[1].sent[0]).toMatchObject({
      text: "Body",
      html: undefined
    });
  });

  it("reports the recipients the server refused", async () => {
    smtp.rejected = ["ada@example.com"];
    const result = await sendNode({ to: "ada@example.com, bob@example.com" }).process();
    expect(result.accepted).toEqual(["bob@example.com"]);
    expect(result.rejected).toEqual(["ada@example.com"]);
  });

  it("refuses to send without credentials, before it opens a connection", async () => {
    await expect(
      new SendEmailLibNode({ to: "a@example.com", text: "x" }).process()
    ).rejects.toThrow("GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD");
    await expect(
      withSecrets(new SendEmailLibNode({ to: "a@example.com", text: "x" }), {
        GOOGLE_MAIL_USER: "me@gmail.com"
      }).process()
    ).rejects.toThrow("GOOGLE_APP_PASSWORD");
    expect(smtp.transports).toHaveLength(0);
  });

  it.each([
    ["Subject: Hello\r\nBcc: attacker@example.com", "Hello\r\nBcc: attacker@example.com"],
    ["a bare line feed", "Hello\nBcc: attacker@example.com"],
    ["a bare carriage return", "Hello\rBcc: attacker@example.com"],
    ["a null byte", "Hello\0Bcc: attacker@example.com"]
  ])("rejects a subject with %s instead of sending it", async (_name, subject) => {
    await expect(sendNode({ subject }).process()).rejects.toThrow(
      "Subject must not contain line breaks"
    );
    expect(smtp.transports).toHaveLength(0);
  });

  it.each(["to", "cc", "bcc"])(
    "rejects line breaks in %s, which would add a header",
    async (field) => {
      await expect(
        sendNode({ [field]: "ada@example.com\r\nBcc: attacker@example.com" }).process()
      ).rejects.toThrow("must not contain line breaks");
      await expect(
        sendNode({ [field]: "ada@example.com>\nBcc: attacker@example.com" }).process()
      ).rejects.toThrow("must not contain line breaks");
      expect(smtp.transports).toHaveLength(0);
    }
  );

  it("rejects a sender from settings that holds a line break", async () => {
    await expect(
      withSecrets(
        new SendEmailLibNode({ to: "a@example.com", text: "x" }),
        { ...SECRETS, GOOGLE_MAIL_USER: "me@gmail.com\r\nBcc: attacker@example.com" }
      ).process()
    ).rejects.toThrow("must not contain line breaks");
    expect(smtp.transports).toHaveLength(0);
  });

  it("lets a body hold line breaks, since a body cannot add headers", async () => {
    await sendNode({ text: "line one\r\nBcc: not-a-header@example.com\nline three" }).process();
    expect(smtp.transports[0].sent[0].text).toBe(
      "line one\r\nBcc: not-a-header@example.com\nline three"
    );
  });

  it.each([
    "not-an-address",
    "missing-domain@",
    "@missing-local.com",
    "two@@example.com",
    "no tld@example",
    "Ada <ada@example.com>",
    '"quoted"@example.com',
    "ada@exa mple.com",
    "ada@example.com, broken"
  ])("rejects the bad recipient %j", async (to) => {
    await expect(sendNode({ to }).process()).rejects.toThrow(
      "To has an invalid email address"
    );
    expect(smtp.transports).toHaveLength(0);
  });

  it("names the field with the bad address", async () => {
    await expect(sendNode({ cc: "nope" }).process()).rejects.toThrow(
      "Cc has an invalid email address: nope"
    );
    await expect(sendNode({ bcc: "nope" }).process()).rejects.toThrow(
      "Bcc has an invalid email address: nope"
    );
  });

  it("requires a recipient, a body and a sendable amount of recipients", async () => {
    await expect(sendNode({ to: "" }).process()).rejects.toThrow(
      "At least one recipient is required"
    );
    await expect(sendNode({ to: " , ; " }).process()).rejects.toThrow(
      "At least one recipient is required"
    );
    await expect(sendNode({ text: "", html: "" }).process()).rejects.toThrow(
      "Text or Html body is required"
    );
    const many = Array.from({ length: 101 }, (_, i) => `u${i}@example.com`).join(",");
    await expect(sendNode({ to: many }).process()).rejects.toThrow(
      "at most 100 recipients"
    );
    expect(smtp.transports).toHaveLength(0);
  });

  it("allows a message with only a bcc recipient", async () => {
    await sendNode({ to: "", bcc: "ada@example.com" }).process();
    expect(smtp.transports[0].sent[0]).toMatchObject({ to: [], bcc: ["ada@example.com"] });
  });

  it("surfaces an SMTP failure as an error and still closes the connection", async () => {
    smtp.sendError = new Error("535 5.7.8 Username and Password not accepted");
    await expect(sendNode().process()).rejects.toThrow(
      "Sending the email failed: 535 5.7.8 Username and Password not accepted"
    );
    expect(smtp.transports[0].closed).toBe(true);
  });
});

describe("lib.mail.EmailTrigger", () => {
  /** What a restart keeps: only the cursor string the host stored. */
  const restart = async (cursor: string, props: Record<string, unknown> = {}) =>
    poll(cursor, props);

  it("takes a baseline on the first poll and starts no run for mail already there", async () => {
    imap.messages = [message(3), message(7), message(9)];
    const first = await poll(null);
    expect(first.events).toEqual([]);
    expect(JSON.parse(first.cursor)).toEqual({ v: 1, uidValidity: "1", lastUid: 9 });
    // It never read a message, so a huge mailbox costs one search-free poll.
    expect(callsNamed("fetch")).toHaveLength(0);
    expect(callsNamed("search")).toHaveLength(0);
  });

  it("baselines an empty folder at UID 0 and then sees its first message", async () => {
    const first = await poll(null);
    expect(JSON.parse(first.cursor).lastUid).toBe(0);
    imap.messages = [message(1)];
    const next = await restart(first.cursor);
    expect(next.events.map((e) => e.id)).toEqual(["1:1"]);
  });

  it("returns only mail above the cursor, oldest first, and moves the cursor with it", async () => {
    imap.messages = [message(1), message(2)];
    const baseline = await poll(null);

    imap.messages = [...imap.messages, message(3), message(4)];
    const result = await restart(baseline.cursor);

    expect(result.events.map((e) => e.id)).toEqual(["1:3", "1:4"]);
    expect(result.events.map((e) => JSON.parse(e.cursor).lastUid)).toEqual([3, 4]);
    expect(JSON.parse(result.cursor).lastUid).toBe(4);
    expect(result.events[0].payload).toMatchObject({
      source: "email",
      event_type: "new_mail",
      email: {
        subject: "Subject 3",
        from: "sender@example.com",
        message_id: "<m3@example.com>",
        body: "Noon at the usual place?"
      }
    });
  });

  it("neither re-fires old mail nor misses new mail across a restart", async () => {
    imap.messages = [message(1), message(2)];
    const baseline = await poll(null);

    imap.messages.push(message(3));
    const afterFirstMail = await restart(baseline.cursor);
    expect(afterFirstMail.events.map((e) => e.id)).toEqual(["1:3"]);

    // The server stops here. The host kept `afterFirstMail.cursor`. Mail
    // arrives while it is down, and a new process polls with the stored cursor.
    imap.messages.push(message(4), message(5));
    const afterRestart = await restart(afterFirstMail.cursor);
    expect(afterRestart.events.map((e) => e.id)).toEqual(["1:4", "1:5"]);

    const quiet = await restart(afterRestart.cursor);
    expect(quiet.events).toEqual([]);
    expect(quiet.cursor).toBe(afterRestart.cursor);
  });

  it("does not return the newest message again when nothing is new", async () => {
    // "N:*" answers with the newest message even below N. Without the UID
    // check every poll would start a run for it.
    imap.messages = [message(1), message(2)];
    const baseline = await poll(null);
    const quiet = await restart(baseline.cursor);
    expect(quiet.events).toEqual([]);
    const range = (callsNamed("search")[0][1] as { uid: string }).uid;
    expect(range).toBe("3:*");
  });

  it("starts at most max_messages runs per poll and picks up the rest next time", async () => {
    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.messages.push(message(2), message(3), message(4));

    const first = await restart(baseline.cursor, { max_messages: 2 });
    expect(first.events.map((e) => e.id)).toEqual(["1:2", "1:3"]);
    // It stopped behind message 3, not at the newest UID, so 4 is not skipped.
    expect(JSON.parse(first.cursor).lastUid).toBe(3);

    const second = await restart(first.cursor, { max_messages: 2 });
    expect(second.events.map((e) => e.id)).toEqual(["1:4"]);
    expect(JSON.parse(second.cursor).lastUid).toBe(4);
  });

  it("only fetches the batch it starts runs for", async () => {
    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.messages.push(message(2), message(3), message(4));
    await restart(baseline.cursor, { max_messages: 2 });
    expect(callsNamed("fetch")[0][1]).toBe("2,3");
  });

  it("sends the folder filters to the server and moves past mail they exclude", async () => {
    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.messages.push(
      message(2, { from: "boss@example.com", subject: "Quarterly report" }),
      message(3, { from: "spam@example.com", subject: "Offer" })
    );

    const props = { from_address: "boss@example.com", subject: "report" };
    const result = await restart(baseline.cursor, props);
    expect(result.events.map((e) => e.id)).toEqual(["1:2"]);
    const [, query] = callsNamed("search")[0];
    expect(query).toMatchObject({
      from: "boss@example.com",
      subject: "report",
      uid: "2:*"
    });
    // The excluded message 3 is behind the cursor now, so it is not searched
    // again on every poll.
    expect(JSON.parse(result.cursor).lastUid).toBe(3);
  });

  it("opens the configured folder under the name the account gives it", async () => {
    imap.mailboxes = GERMAN_ACCOUNT;
    await poll(null, { folder: "[Gmail]/Sent Mail" });
    expect(callsNamed("lock")[0][1]).toBe("[Google Mail]/Gesendet");
  });

  it("takes a new baseline when the folder's UIDs were reassigned", async () => {
    imap.messages = [message(1), message(2)];
    const baseline = await poll(null);

    // UIDVALIDITY changed: the old UIDs mean nothing, so a poll that kept the
    // old cursor would start a run per message or skip real new mail.
    imap.uidValidity = 2n;
    imap.messages = [message(1), message(2), message(3)];
    const result = await restart(baseline.cursor);
    expect(result.events).toEqual([]);
    expect(JSON.parse(result.cursor)).toEqual({ v: 1, uidValidity: "2", lastUid: 3 });
  });

  it.each([["not json"], ['{"v":2}'], ['{"v":1,"uidValidity":"1","lastUid":-4}'], [""]])(
    "treats the unreadable cursor %j as no cursor",
    async (cursor) => {
      imap.messages = [message(1), message(2)];
      const result = await poll(cursor);
      expect(result.events).toEqual([]);
      expect(JSON.parse(result.cursor).lastUid).toBe(2);
    }
  );

  it("skips a message that was deleted between the search and the fetch", async () => {
    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.messages.push(message(2), message(3));
    imap.expungeAfterSearch = [2];
    const result = await restart(baseline.cursor);
    expect(result.events.map((e) => e.id)).toEqual(["1:3"]);
    expect(JSON.parse(result.cursor).lastUid).toBe(3);
  });

  it("decodes the body of real mail", async () => {
    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.messages.push(message(2, { source: MULTIPART }));
    const [event] = (await restart(baseline.cursor)).events;
    expect((event.payload as { email: { body: string } }).email.body).toContain(
      "Grüße from the invoice desk"
    );
  });

  it("connects to Gmail with the app password and logs out", async () => {
    await poll(null);
    expect(lastClient().options).toMatchObject({
      host: "imap.gmail.com",
      secure: true,
      auth: { user: "me@gmail.com", pass: "app-password" }
    });
    expect(lastClient().loggedOut).toBe(true);
    expect(callsNamed("release")).toHaveLength(1);
  });

  it("fails without credentials, before it opens a connection", async () => {
    await expect(poll(null, {}, {})).rejects.toThrow(
      "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings."
    );
    await expect(
      poll(null, {}, { GOOGLE_MAIL_USER: "me@gmail.com" })
    ).rejects.toThrow("GOOGLE_APP_PASSWORD");
    expect(imap.clients).toHaveLength(0);
  });

  it("surfaces a failed login and a failed search, and logs out after the search", async () => {
    imap.connectError = new Error("Invalid credentials (Failure)");
    await expect(poll(null)).rejects.toThrow("Invalid credentials");
    imap.connectError = null;

    imap.messages = [message(1)];
    const baseline = await poll(null);
    imap.searchError = new Error("Command failed");
    await expect(restart(baseline.cursor)).rejects.toThrow("Command failed");
    expect(lastClient().loggedOut).toBe(true);
  });

  it("emits the mail on the declared slots when the host delivers an event", async () => {
    const emitted: Record<string, unknown> = {};
    await triggerNode().emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload: mailEventPayload() },
      { emit: async (key: string, value: unknown) => void (emitted[key] = value) } as never
    );
    expect(emitted).toMatchObject({
      subject: "Invoice",
      sender: "alice@example.com",
      date: "2026-01-01T00:00:00.000Z",
      message_id: "<a@example.com>",
      body: "Please pay",
      source: "email",
      event_type: "new_mail"
    });
    expect(emitted.email).toMatchObject({ subject: "Invoice" });
  });

  it.each([
    ["a bare tick", { tick: 1, source: "schedule", event_type: "tick" }],
    ["no payload", null],
    ["a payload with no mail", { source: "email" }]
  ])("emits nothing for %s, since there is no mail to hand on", async (_name, payload) => {
    const emitted: string[] = [];
    await triggerNode().emitTriggerEvent(
      { node_id: "n1", input_id: "i1", payload },
      { emit: async (key: string) => void emitted.push(key) } as never
    );
    expect(emitted).toEqual([]);
  });

  it("shows the newest matching mail in the editor, oldest first", async () => {
    imap.messages = [message(1), message(2), message(3)];
    const seen: string[] = [];
    for await (const item of triggerNode({ max_messages: 2 }).genProcess()) {
      seen.push(item.subject);
    }
    expect(seen).toEqual(["Subject 2", "Subject 3"]);
  });

  it("keeps interval_seconds as the property name the schedule adapter reads", () => {
    const props = EmailTriggerLibNode.getDeclaredProperties().map((p) => p.name);
    expect(props).toContain("interval_seconds");
  });
});
