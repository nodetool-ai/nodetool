import type { ImapFlow } from "imapflow";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;
const ALL_MAIL_FOLDER = "[Gmail]/All Mail";

/** Longest body, in characters, a search result carries. */
const MAX_BODY_CHARS = 10_000;

const MISSING_CREDENTIALS =
  "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings.";

/**
 * Create an ImapFlow client connected to Gmail using an app password.
 *
 * `imapflow` loads here, not at module scope, so a run that never touches mail
 * never loads an IMAP client.
 */
async function createImapClient(
  user: string,
  appPassword: string
): Promise<ImapFlow> {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: { user, pass: appPassword },
    logger: false
  });
  // ImapFlow is an EventEmitter. A socket error with no "error" listener is
  // thrown as an uncaught exception and takes the server process down. The same
  // failure also rejects the command in flight, which is where the node reports
  // it, so the listener only has to exist.
  client.on("error", () => {});
  await client.connect();
  return client;
}

/**
 * Run `work` on a connected client and always log out. A logout that fails must
 * not replace the error `work` threw.
 */
async function withImapClient<T>(
  secrets: Record<string, string>,
  work: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const user = secrets["GOOGLE_MAIL_USER"];
  const pass = secrets["GOOGLE_APP_PASSWORD"];
  if (!user || !pass) {
    throw new Error(MISSING_CREDENTIALS);
  }
  const client = await createImapClient(user, pass);
  try {
    return await work(client);
  } finally {
    await client.logout().catch(() => {
      /* Intentional: best-effort logout during cleanup */
    });
  }
}

/** IMAP special-use role of each Gmail system folder the nodes offer. */
const SPECIAL_USE_BY_FOLDER: Record<string, string> = {
  "[Gmail]/Sent Mail": "\\Sent",
  "[Gmail]/Drafts": "\\Drafts",
  "[Gmail]/Spam": "\\Junk",
  "[Gmail]/Trash": "\\Trash",
  [ALL_MAIL_FOLDER]: "\\All"
};

/**
 * The path of a Gmail system folder on this account. Gmail names these folders
 * in the account's language ("[Gmail]/Gesendet"), and some regions use
 * "[Google Mail]" in place of "[Gmail]", so the English path only exists on
 * some accounts. The special-use role is the same everywhere. A folder with no
 * role, such as INBOX, or an account that does not list the role, keeps the
 * path it was given.
 */
async function resolveFolder(client: ImapFlow, folder: string): Promise<string> {
  const specialUse = SPECIAL_USE_BY_FOLDER[folder];
  if (!specialUse) return folder;
  const mailboxes = await client.list();
  return mailboxes.find((m) => m.specialUse === specialUse)?.path ?? folder;
}

/** Run `work` with `folder` selected, releasing the mailbox lock afterwards. */
async function inMailbox<T>(
  client: ImapFlow,
  folder: string,
  work: () => Promise<T>
): Promise<T> {
  const lock = await client.getMailboxLock(folder);
  try {
    return await work();
  } finally {
    lock.release();
  }
}

/**
 * UIDs of the messages whose Message-ID header matches, in the mailbox that is
 * open. IMAP numbers messages by position, and the position moves when mail
 * arrives or is expunged, so every follow-up command takes UIDs.
 */
async function findUidsByMessageId(
  client: ImapFlow,
  messageId: string
): Promise<number[]> {
  const found = await client.search(
    { header: { "message-id": messageId } },
    { uid: true }
  );
  if (!found || found.length === 0) {
    throw new Error(`Message not found: ${messageId}`);
  }
  return found;
}

/**
 * Compute a date threshold from a named filter.
 */
function dateThreshold(filter: string): Date {
  const now = new Date();
  switch (filter) {
    case "SINCE_ONE_HOUR":
      return new Date(now.getTime() - 60 * 60 * 1000);
    case "SINCE_ONE_DAY":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "SINCE_ONE_WEEK":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "SINCE_ONE_MONTH":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "SINCE_ONE_YEAR":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}

/**
 * A date ImapFlow returned (the `Date` header or the arrival time) as a `Date`,
 * or `undefined` when it is missing or invalid. ImapFlow returns the raw header
 * string when a date does not parse, and a message with a broken `Date` header
 * is still mail the workflow should see.
 */
function envelopeDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Readable text of a raw message. Real mail is multipart, quoted-printable or
 * base64, so the bytes after the header block are not text. `mailparser`
 * decodes the MIME structure and turns an HTML-only message into text.
 */
async function bodyText(source: Buffer): Promise<string> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(source);
  return (parsed.text ?? "").trim().slice(0, MAX_BODY_CHARS);
}

interface FoundEmail {
  email: Record<string, unknown>;
  message_id: string;
}

export class GmailSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.GmailSearch";
  static readonly title = "Gmail Search";
  static readonly description =
    "Searches a Gmail mailbox over IMAP by sender, recipient, subject, body, keyword and date, and yields the matching emails newest first. Each field is a plain filter. Gmail search operators such as from: or is:unread are not supported.\n    email, gmail, search\n\n    Use cases:\n    - Search for emails based on specific criteria\n    - Retrieve emails from a specific sender\n    - Filter emails by subject, sender, or date";
  static readonly metadataOutputTypes = {
    email: "dict",
    message_id: "str",
    subject: "str",
    sender: "str",
    date: "str",
    body: "str",
    emails: "list",
    message_ids: "list"
  };
  static readonly inlineFields = ["from_address", "subject"];
  static readonly inputFields = ["text"];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    email: { kind: "iteration", source: "__execution__", group: "items" },
    message_id: { kind: "iteration", source: "__execution__", group: "items" },
    subject: { kind: "iteration", source: "__execution__", group: "items" },
    sender: { kind: "iteration", source: "__execution__", group: "items" },
    date: { kind: "iteration", source: "__execution__", group: "items" },
    body: { kind: "iteration", source: "__execution__", group: "items" },
    emails: { kind: "single", source: "__execution__" },
    message_ids: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "str",
    default: "",
    title: "From Address",
    description: "Sender's email address to search for"
  })
  declare from_address: any;

  @prop({
    type: "str",
    default: "",
    title: "To Address",
    description: "Recipient's email address to search for"
  })
  declare to_address: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Text to search for in email subject"
  })
  declare subject: any;

  @prop({
    type: "str",
    default: "",
    title: "Body",
    description: "Text to search for in email body"
  })
  declare body: any;

  @prop({
    type: "enum",
    default: "SINCE_ONE_DAY",
    title: "Date Filter",
    description: "Date filter to search for",
    values: [
      "SINCE_ONE_HOUR",
      "SINCE_ONE_DAY",
      "SINCE_ONE_WEEK",
      "SINCE_ONE_MONTH",
      "SINCE_ONE_YEAR"
    ]
  })
  declare date_filter: any;

  @prop({
    type: "str",
    default: "",
    title: "Keywords",
    description: "Custom keywords or labels to search for"
  })
  declare keywords: any;

  @prop({
    type: "enum",
    default: "INBOX",
    title: "Folder",
    description: "Email folder to search in",
    values: [
      "INBOX",
      "[Gmail]/Sent Mail",
      "[Gmail]/Drafts",
      "[Gmail]/Spam",
      "[Gmail]/Trash"
    ]
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "General text to search for anywhere in the email"
  })
  declare text: any;

  @prop({
    type: "int",
    default: 50,
    title: "Max Results",
    description: "Maximum number of emails to return, newest first"
  })
  declare max_results: any;

  private async _fetchEmails(): Promise<FoundEmail[]> {
    return withImapClient(this._secrets, async (client) => {
      const threshold = dateThreshold(String(this.date_filter ?? "SINCE_ONE_DAY"));

      // IMAP's SINCE compares calendar days, so the server returns the whole
      // day even for "since one hour". The threshold is applied again to each
      // message's arrival time below, the clock SINCE itself uses. A sender's
      // Date header can be hours or days off for mail that sat in a queue.
      const query: Record<string, unknown> = { since: threshold };
      const from = String(this.from_address ?? "");
      if (from) query.from = from;
      const to = String(this.to_address ?? "");
      if (to) query.to = to;
      const subject = String(this.subject ?? "");
      if (subject) query.subject = subject;
      const body = String(this.body ?? "");
      if (body) query.body = body;
      const text = String(this.text ?? "");
      if (text) query.text = text;
      // Gmail shows its labels as folders, not as IMAP keyword flags, so a
      // `keyword` search never matches one. `labels` is Gmail's own criterion.
      const labels = String(this.keywords ?? "")
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      if (labels.length > 0) query.labels = { has: labels };

      const maxResults = Math.max(1, Number(this.max_results ?? 50));
      const folder = await resolveFolder(client, String(this.folder ?? "INBOX"));

      return inMailbox(client, folder, async () => {
        const uids = (await client.search(query, { uid: true })) || [];
        if (uids.length === 0) return [];

        // UIDs grow with arrival, so the newest mail has the highest UIDs. Take
        // them before fetching, otherwise a busy mailbox returns the oldest
        // `max_results` matches and drops the mail the workflow is after.
        const newest = [...uids].sort((a, b) => b - a).slice(0, maxResults);

        const fetched = new Map<number, FoundEmail>();
        for await (const msg of client.fetch(
          newest.join(","),
          { envelope: true, source: true, uid: true, internalDate: true },
          { uid: true }
        )) {
          const envelope = msg.envelope || {};
          const sent = envelopeDate(envelope.date);
          const arrived = envelopeDate(msg.internalDate) ?? sent;
          if (arrived && arrived < threshold) continue;

          const email: Record<string, unknown> = {
            subject: envelope.subject ?? "",
            from: envelope.from?.[0]?.address ?? "",
            to:
              envelope.to
                ?.map((a: { address?: string }) => a.address)
                .join(", ") ?? "",
            date: sent?.toISOString() ?? "",
            message_id: envelope.messageId ?? "",
            body: msg.source ? await bodyText(msg.source) : ""
          };
          fetched.set(msg.uid, {
            email,
            message_id: String(envelope.messageId ?? "")
          });
        }

        // The server answers in ascending UID order whatever order was asked.
        return newest
          .map((uid) => fetched.get(uid))
          .filter((item): item is FoundEmail => item !== undefined);
      });
    });
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const results = await this._fetchEmails();

    // Stream individual emails with the email dict plus its decomposed fields
    // so downstream nodes can wire to subject/sender/body/date directly without
    // an EmailFields step.
    for (const item of results) {
      yield {
        email: item.email,
        message_id: item.message_id,
        subject: String(item.email.subject ?? ""),
        sender: String(item.email.from ?? ""),
        date: String(item.email.date ?? ""),
        body: String(item.email.body ?? "")
      };
    }

    // Emit collected lists as final output
    yield {
      emails: results.map((r) => r.email),
      message_ids: results.map((r) => r.message_id)
    };
  }

  async process(): Promise<Record<string, unknown>> {
    const results = await this._fetchEmails();
    const first = results[0]?.email ?? {};
    return {
      email: first,
      message_id: results[0]?.message_id ?? "",
      subject: String(first.subject ?? ""),
      sender: String(first.from ?? ""),
      date: String(first.date ?? ""),
      body: String(first.body ?? ""),
      emails: results.map((r) => r.email),
      message_ids: results.map((r) => r.message_id)
    };
  }
}

/** Output handles AddLabelLibNode.process() emits. */
type AddLabelLibNodeOutputs = {
  output: boolean;
};

export class AddLabelLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.AddLabel";
  static readonly title = "Add Label";
  static readonly description =
    "Adds a label to a Gmail message.\n    email, gmail, label";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly inlineFields = ["message_id", "label"];
  static readonly inputFields = [];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Message Id",
    description: "Message ID to label"
  })
  declare message_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Label",
    description: "Label to add to the message"
  })
  declare label: any;

  async process(): Promise<AddLabelLibNodeOutputs> {
    const messageId = String(this.message_id ?? "");
    const label = String(this.label ?? "");
    if (!messageId) throw new Error("Message ID is required");
    if (!label) throw new Error("Label is required");

    return withImapClient(this._secrets, (client) =>
      inMailbox(client, "INBOX", async () => {
        const uids = await findUidsByMessageId(client, messageId);

        // Gmail shows a label as an IMAP folder. Copying the message into the
        // folder applies the label and leaves the message in the inbox.
        const copied = await client.messageCopy(uids, label, { uid: true });
        return { output: Boolean(copied) };
      })
    );
  }
}

/** Output handles MoveToArchiveLibNode.process() emits. */
type MoveToArchiveLibNodeOutputs = {
  output: boolean;
};

export class MoveToArchiveLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.MoveToArchive";
  static readonly title = "Move To Archive";
  static readonly description =
    "Moves specified emails to Gmail archive.\n    email, gmail, archive";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly inlineFields = ["message_id"];
  static readonly inputFields = [];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Message Id",
    description: "Message ID to archive"
  })
  declare message_id: any;

  async process(): Promise<MoveToArchiveLibNodeOutputs> {
    const messageId = String(this.message_id ?? "");
    if (!messageId) throw new Error("Message ID is required");

    return withImapClient(this._secrets, async (client) => {
      const allMail = await resolveFolder(client, ALL_MAIL_FOLDER);
      return inMailbox(client, "INBOX", async () => {
        const uids = await findUidsByMessageId(client, messageId);

        // In Gmail, archiving is leaving the inbox: moving the message to All
        // Mail drops the Inbox label. messageMove resolves to false when the
        // server did not move anything.
        const moved = await client.messageMove(uids, allMail, { uid: true });
        return { output: Boolean(moved) };
      });
    });
  }
}

export const LIB_MAIL_NODES = tagAsServer([
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode
]);
