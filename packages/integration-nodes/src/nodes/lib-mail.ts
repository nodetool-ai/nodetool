import type { ImapFlow } from "imapflow";
import {
  BaseNode,
  prop,
  type StreamingOutputs,
  type TriggerEvent,
  type PollTrigger,
  type TriggerPollEvent,
  type TriggerPollInput,
  type TriggerPollResult
} from "@nodetool-ai/node-sdk";
import type {
  InputMode,
  NodeEffect,
  OutputCorrelation
} from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const GMAIL_IMAP_HOST = "imap.gmail.com";
const GMAIL_IMAP_PORT = 993;
const ALL_MAIL_FOLDER = "[Gmail]/All Mail";

const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;

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

/** The fields of one fetched message that the nodes hand to a workflow. */
interface FetchedMessage {
  envelope?: {
    subject?: string;
    messageId?: string;
    from?: Array<{ address?: string }>;
    to?: Array<{ address?: string }>;
  };
  source?: Buffer;
}

/** The email dict `GmailSearch` and `EmailTrigger` both emit. */
async function emailFromMessage(
  msg: FetchedMessage,
  sent: Date | undefined
): Promise<Record<string, unknown>> {
  const envelope = msg.envelope || {};
  return {
    subject: envelope.subject ?? "",
    from: envelope.from?.[0]?.address ?? "",
    to: envelope.to?.map((a) => a.address).join(", ") ?? "",
    date: sent?.toISOString() ?? "",
    message_id: envelope.messageId ?? "",
    body: msg.source ? await bodyText(msg.source) : ""
  };
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

          fetched.set(msg.uid, {
            email: await emailFromMessage(msg, sent),
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

// ---------------------------------------------------------------------------
// SendEmail
// ---------------------------------------------------------------------------

/** Most recipients (to, cc and bcc together) one message may name. */
const MAX_RECIPIENTS = 100;

/**
 * A plain `local@domain.tld` address. Display names, quoted local parts and
 * comments are not accepted: each of them is a way to smuggle extra syntax
 * into a header, and a workflow that wants to mail "Ada <ada@example.com>" can
 * pass the bare address.
 */
const ADDRESS_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/**
 * A header value must stay on one line. A CR or LF inside a subject or an
 * address would end the header and start a new one (`Bcc:`, `Content-Type:`),
 * so such a value is refused outright instead of being cleaned up.
 */
function assertSingleLine(label: string, value: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`${label} must not contain line breaks`);
  }
}

/**
 * The addresses in a comma or semicolon separated list. Every entry must be a
 * plain address. An empty list is valid and returns no entries.
 */
function parseRecipients(label: string, value: unknown): string[] {
  const raw = String(value ?? "");
  assertSingleLine(label, raw);
  const addresses: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const address = part.trim();
    if (!address) continue;
    if (address.length > 254 || !ADDRESS_PATTERN.test(address)) {
      throw new Error(`${label} has an invalid email address: ${address.slice(0, 80)}`);
    }
    addresses.push(address);
  }
  return addresses;
}

/** Output handles SendEmailLibNode.process() emits. */
type SendEmailLibNodeOutputs = {
  message_id: string;
  accepted: string[];
  rejected: string[];
};

export class SendEmailLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.SendEmail";
  static readonly title = "Send Email";
  static readonly description =
    "Sends an email from a Gmail account over SMTP with a Google app password. Recipients are plain addresses separated by commas. Attachments are not supported.\n    email, gmail, send, smtp, mail";
  static readonly metadataOutputTypes = {
    message_id: "str",
    accepted: "list[str]",
    rejected: "list[str]"
  };
  static readonly inlineFields = ["to", "subject"];
  static readonly inputFields = ["text"];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];
  // Sending mail leaves the system and cannot be undone, so a reactive run
  // never fires it without an explicit action. Retrying a send that failed
  // halfway could deliver the message twice, so it is not retry safe either.
  static readonly effect: NodeEffect = "external";

  @prop({
    type: "str",
    default: "",
    title: "To",
    description: "Recipient email addresses, separated by commas"
  })
  declare to: any;

  @prop({
    type: "str",
    default: "",
    title: "Cc",
    description: "Cc email addresses, separated by commas"
  })
  declare cc: any;

  @prop({
    type: "str",
    default: "",
    title: "Bcc",
    description: "Bcc email addresses, separated by commas"
  })
  declare bcc: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Subject line. It must be a single line."
  })
  declare subject: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Plain text body"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Html",
    description:
      "Optional HTML body. Mail clients that show HTML use it, the others use the text body."
  })
  declare html: any;

  async process(): Promise<SendEmailLibNodeOutputs> {
    const user = this._secrets["GOOGLE_MAIL_USER"];
    const pass = this._secrets["GOOGLE_APP_PASSWORD"];
    if (!user || !pass) {
      throw new Error(MISSING_CREDENTIALS);
    }

    const to = parseRecipients("To", this.to);
    const cc = parseRecipients("Cc", this.cc);
    const bcc = parseRecipients("Bcc", this.bcc);
    if (to.length + cc.length + bcc.length === 0) {
      throw new Error("At least one recipient is required");
    }
    if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
      throw new Error(`A message may have at most ${MAX_RECIPIENTS} recipients`);
    }
    const subject = String(this.subject ?? "");
    assertSingleLine("Subject", subject);
    const text = String(this.text ?? "");
    const html = String(this.html ?? "");
    if (!text && !html) {
      throw new Error("Text or Html body is required");
    }
    // The sender comes from settings, not from the workflow, and goes into the
    // From header, so it is held to the same rule as the recipients.
    if (parseRecipients("GOOGLE_MAIL_USER", user).length !== 1) {
      throw new Error("GOOGLE_MAIL_USER must be one email address");
    }

    // `nodemailer` loads here, not at module scope, so a run that never sends
    // mail never loads an SMTP client.
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: GMAIL_SMTP_HOST,
      port: GMAIL_SMTP_PORT,
      secure: true,
      auth: { user, pass },
      // A mail server that stops answering must not hold the run forever.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000
    });
    try {
      const info = await transport.sendMail({
        from: user,
        to,
        cc,
        bcc,
        subject,
        text: text || undefined,
        html: html || undefined
      });
      return {
        message_id: String(info.messageId ?? ""),
        accepted: (info.accepted ?? []).map(String),
        rejected: (info.rejected ?? []).map(String)
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Sending the email failed: ${reason}`);
    } finally {
      transport.close();
    }
  }
}

// ---------------------------------------------------------------------------
// EmailTrigger
// ---------------------------------------------------------------------------

/** Most messages one poll starts a run for. Mail beyond it is picked up by the next poll. */
const MAX_MESSAGES_PER_POLL = 100;
const DEFAULT_MESSAGES_PER_POLL = 10;
/** Gmail throttles IMAP logins, so a poll more often than this is refused. */
const MIN_POLL_SECONDS = 30;

/**
 * Where a poll stopped. `uidValidity` is the server's id for the numbering of
 * a folder. When it changes the UIDs were reassigned and a stored `lastUid`
 * means nothing, so the trigger takes a new baseline.
 */
interface MailCursor {
  v: 1;
  uidValidity: string;
  lastUid: number;
}

function encodeCursor(cursor: MailCursor): string {
  return JSON.stringify(cursor);
}

function decodeCursor(raw: string | null): MailCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as MailCursor).v === 1 &&
      typeof (parsed as MailCursor).uidValidity === "string" &&
      Number.isInteger((parsed as MailCursor).lastUid) &&
      (parsed as MailCursor).lastUid >= 0
    ) {
      return parsed as MailCursor;
    }
  } catch {
    /* Intentional: a cursor that does not parse is treated as no cursor */
  }
  return null;
}

/** Output handles the email trigger emits. */
type EmailTriggerOutputs = {
  email: Record<string, unknown>;
  message_id: string;
  subject: string;
  sender: string;
  date: string;
  body: string;
  source: string;
  event_type: string;
};

function emailEvent(email: Record<string, unknown>): EmailTriggerOutputs {
  return {
    email,
    message_id: String(email.message_id ?? ""),
    subject: String(email.subject ?? ""),
    sender: String(email.from ?? ""),
    date: String(email.date ?? ""),
    body: String(email.body ?? ""),
    source: "email",
    event_type: "new_mail"
  };
}

export class EmailTriggerLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.EmailTrigger";
  static readonly title = "Email Trigger";
  static readonly description =
    "Starts a workflow in the background when new mail arrives in a Gmail folder. The server checks the folder over IMAP on a schedule and starts one run for each new message. Mail that is already there when the trigger is turned on does not start a run.\n    trigger, email, gmail, imap, mail, inbox, new mail";
  static readonly metadataOutputTypes = {
    email: "dict",
    message_id: "str",
    subject: "str",
    sender: "str",
    date: "str",
    body: "str",
    source: "str",
    event_type: "str"
  };
  static readonly inlineFields = ["interval_seconds", "from_address"];
  static readonly inputFields = [];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];
  static readonly isTrigger = true;

  @prop({
    type: "enum",
    default: "INBOX",
    title: "Folder",
    description: "Email folder to watch",
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
    title: "From Address",
    description: "Only start a run for mail from this sender"
  })
  declare from_address: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Only start a run for mail whose subject contains this text"
  })
  declare subject: any;

  // The schedule adapter reads `interval_seconds` from the registration, so the
  // property keeps the name the interval trigger uses.
  @prop({
    type: "float",
    default: 60,
    title: "Poll Interval Seconds",
    description: `Seconds between checks of the folder, at least ${MIN_POLL_SECONDS}`,
    min: MIN_POLL_SECONDS
  })
  declare interval_seconds: any;

  @prop({
    type: "int",
    default: DEFAULT_MESSAGES_PER_POLL,
    title: "Max Messages Per Check",
    description:
      "Most new messages that start a run in one check. The rest wait for the next check.",
    min: 1,
    max: MAX_MESSAGES_PER_POLL
  })
  declare max_messages: any;

  async process(): Promise<Record<string, never>> {
    return {};
  }

  /**
   * Wake-up entry point. The poller below hands each new message to the run as
   * the event payload.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const payload = event.payload;
    // A bare tick from a host without the poller carries no mail, and a run
    // with empty mail outputs would only confuse the workflow.
    if (
      payload === null ||
      typeof payload !== "object" ||
      (payload as { source?: unknown }).source !== "email"
    ) {
      return;
    }
    const email = (payload as { email?: unknown }).email;
    if (email === null || typeof email !== "object") return;
    for (const [key, value] of Object.entries(
      emailEvent(email as Record<string, unknown>)
    )) {
      await outputs.emit(key, value);
    }
  }

  /** The search filters this node's properties describe. */
  private _filters(): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    const from = String(this.from_address ?? "").trim();
    if (from) query.from = from;
    const subject = String(this.subject ?? "").trim();
    if (subject) query.subject = subject;
    return query;
  }

  private _limit(): number {
    const value = Math.floor(Number(this.max_messages));
    if (!Number.isFinite(value)) return DEFAULT_MESSAGES_PER_POLL;
    return Math.min(MAX_MESSAGES_PER_POLL, Math.max(1, value));
  }

  static readonly pollTrigger: PollTrigger = (input) =>
    EmailTriggerLibNode.poll(input);

  /**
   * One check of the folder, called by the host each time the registration's
   * schedule is due.
   *
   * The cursor is the highest UID the trigger has seen, with the folder's
   * UIDVALIDITY. UIDs only grow in a folder, so "UID above the cursor" is the
   * set of new messages, and a restart that reloads the cursor neither starts
   * a run for old mail nor skips new mail.
   *
   * The first check has no cursor. It records where the folder ends and starts
   * no run, so turning the trigger on does not run the workflow once per
   * message already in the folder.
   */
  private static async poll(
    input: TriggerPollInput
  ): Promise<TriggerPollResult> {
    const node = new EmailTriggerLibNode(input.properties);
    const filters = node._filters();
    const limit = node._limit();
    const previous = decodeCursor(input.cursor);

    return withImapClient(input.secrets, async (client) => {
      const folder = await resolveFolder(client, String(node.folder ?? "INBOX"));
      return inMailbox(client, folder, async () => {
        const box = client.mailbox;
        if (!box) {
          throw new Error(`Could not open the mail folder ${folder}`);
        }
        const uidValidity = String(box.uidValidity);
        // Read before the search. Mail that arrives after this point has a UID
        // at or above `uidNext`, so the cursor never jumps over it.
        const newestUid = Math.max(0, Number(box.uidNext) - 1);

        if (!previous || previous.uidValidity !== uidValidity) {
          return {
            events: [],
            cursor: encodeCursor({ v: 1, uidValidity, lastUid: newestUid })
          };
        }

        // IMAP answers "N:*" with the newest message even when its UID is below
        // N, so the range alone would return the last message again on every
        // check. The UIDs are filtered here as well.
        const found =
          (await client.search(
            { ...filters, uid: `${previous.lastUid + 1}:*` },
            { uid: true }
          )) || [];
        const fresh = found
          .filter((uid) => uid > previous.lastUid)
          .sort((a, b) => a - b);
        const batch = fresh.slice(0, limit);

        const events: TriggerPollEvent[] = [];
        if (batch.length > 0) {
          const fetched = new Map<number, Record<string, unknown>>();
          for await (const msg of client.fetch(
            batch.join(","),
            { envelope: true, source: true, uid: true },
            { uid: true }
          )) {
            fetched.set(
              msg.uid,
              await emailFromMessage(msg, envelopeDate(msg.envelope?.date))
            );
          }
          for (const uid of batch) {
            const email = fetched.get(uid);
            // A message deleted between the search and the fetch is gone.
            if (!email) continue;
            events.push({
              id: `${uidValidity}:${uid}`,
              payload: { source: "email", event_type: "new_mail", email },
              cursor: encodeCursor({ v: 1, uidValidity, lastUid: uid })
            });
          }
        }

        // More mail is waiting than one check starts runs for. Stop at the last
        // message of the batch so the next check starts right behind it.
        const cutShort = fresh.length > batch.length;
        const lastUid = cutShort
          ? batch[batch.length - 1]
          : Math.max(previous.lastUid, newestUid, ...batch);
        return {
          events,
          cursor: encodeCursor({ v: 1, uidValidity, lastUid })
        };
      });
    });
  }

  /**
   * Editor run, with no trigger event: yields the newest matching messages
   * once, so a workflow under construction has real mail to work with.
   */
  async *genProcess(): AsyncGenerator<EmailTriggerOutputs> {
    const emails = await withImapClient(this._secrets, async (client) => {
      const folder = await resolveFolder(client, String(this.folder ?? "INBOX"));
      return inMailbox(client, folder, async () => {
        const uids = (await client.search(this._filters(), { uid: true })) || [];
        const newest = [...uids].sort((a, b) => b - a).slice(0, this._limit());
        if (newest.length === 0) return [];
        const fetched = new Map<number, Record<string, unknown>>();
        for await (const msg of client.fetch(
          newest.join(","),
          { envelope: true, source: true, uid: true },
          { uid: true }
        )) {
          fetched.set(
            msg.uid,
            await emailFromMessage(msg, envelopeDate(msg.envelope?.date))
          );
        }
        // Oldest first, the order a live trigger would deliver them in.
        return [...newest]
          .reverse()
          .map((uid) => fetched.get(uid))
          .filter((email): email is Record<string, unknown> => email !== undefined);
      });
    });
    for (const email of emails) {
      yield emailEvent(email);
    }
  }
}

export const LIB_MAIL_NODES = tagAsServer([
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  SendEmailLibNode,
  EmailTriggerLibNode
]);
