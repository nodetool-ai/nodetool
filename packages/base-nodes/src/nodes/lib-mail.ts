import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

export class SendEmailLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.SendEmail";
  static readonly title = "Send Email";
  static readonly description =
    "Send a plain text email via SMTP.\n    email, smtp, send\n\n    Use cases:\n    - Send simple notification messages\n    - Automate email reports";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "smtp.gmail.com",
    title: "Smtp Server",
    description: "SMTP server hostname"
  })
  declare smtp_server: any;

  @prop({
    type: "int",
    default: 587,
    title: "Smtp Port",
    description: "SMTP server port"
  })
  declare smtp_port: any;

  @prop({
    type: "str",
    default: "",
    title: "Username",
    description: "SMTP username"
  })
  declare username: any;

  @prop({
    type: "str",
    default: "",
    title: "Password",
    description: "SMTP password"
  })
  declare password: any;

  @prop({
    type: "str",
    default: "",
    title: "From Address",
    description: "Sender email address"
  })
  declare from_address: any;

  @prop({
    type: "str",
    default: "",
    title: "To Address",
    description: "Recipient email address"
  })
  declare to_address: any;

  @prop({
    type: "str",
    default: "",
    title: "Subject",
    description: "Email subject"
  })
  declare subject: any;

  @prop({ type: "str", default: "", title: "Body", description: "Email body" })
  declare body: any;

  async process(): Promise<Record<string, unknown>> {
    const smtpServer = String(this.smtp_server ?? "smtp.gmail.com");
    const smtpPort = Number(this.smtp_port ?? 587);
    const username = String(this.username ?? "");
    const password = String(this.password ?? "");
    const fromAddress = String(this.from_address ?? "");
    const toAddress = String(this.to_address ?? "");
    const subject = String(this.subject ?? "");
    const body = String(this.body ?? "");

    if (!toAddress) throw new Error("Recipient email address is required");

    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: smtpServer,
      port: smtpPort,
      secure: false,
      auth: username ? { user: username, pass: password } : undefined
    });

    await transporter.sendMail({
      from: fromAddress || username,
      to: toAddress,
      subject,
      text: body
    });

    return { output: true };
  }
}

/**
 * Create an ImapFlow client connected to Gmail using app password.
 */
async function createImapClient(
  user: string,
  appPassword: string
): Promise<any> {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass: appPassword },
    logger: false
  });
  await client.connect();
  return client;
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

export class GmailSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.GmailSearch";
  static readonly title = "Gmail Search";
  static readonly description =
    "Searches Gmail using Gmail-specific search operators and yields matching emails.\n    email, gmail, search\n\n    Use cases:\n    - Search for emails based on specific criteria\n    - Retrieve emails from a specific sender\n    - Filter emails by subject, sender, or date";
  static readonly metadataOutputTypes = {
    email: "dict",
    message_id: "str",
    emails: "list",
    message_ids: "list"
  };
  static readonly basicFields = [
    "from_address",
    "subject",
    "body",
    "date_filter",
    "max_results"
  ];
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
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
    description: "Maximum number of emails to return"
  })
  declare max_results: any;

  private async _fetchEmails(): Promise<
    Array<{ email: Record<string, unknown>; message_id: string }>
  > {
    const user = this._secrets["GOOGLE_MAIL_USER"];
    const pass = this._secrets["GOOGLE_APP_PASSWORD"];
    if (!user || !pass) {
      throw new Error(
        "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings."
      );
    }

    const client = await createImapClient(user, pass);
    try {
      const folder = String(this.folder ?? "INBOX");
      await client.mailboxOpen(folder);

      const query: Record<string, unknown> = {
        since: dateThreshold(String(this.date_filter ?? "SINCE_ONE_DAY"))
      };
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
      const keywords = String(this.keywords ?? "");
      if (keywords) query.keyword = keywords;

      const maxResults = Math.max(1, Number(this.max_results ?? 50));
      const results: Array<{
        email: Record<string, unknown>;
        message_id: string;
      }> = [];

      for await (const msg of client.fetch(query, {
        envelope: true,
        source: true
      })) {
        if (results.length >= maxResults) break;

        const envelope = msg.envelope || {};
        const emailData: Record<string, unknown> = {
          subject: envelope.subject ?? "",
          from: envelope.from?.[0]?.address ?? "",
          to:
            envelope.to
              ?.map((a: { address?: string }) => a.address)
              .join(", ") ?? "",
          date: envelope.date?.toISOString() ?? "",
          message_id: envelope.messageId ?? ""
        };

        if (msg.source) {
          const raw = msg.source.toString();
          const headerEnd = raw.indexOf("\r\n\r\n");
          if (headerEnd > -1) {
            emailData.body = raw.substring(headerEnd + 4).substring(0, 10000);
          }
        }

        results.push({
          email: emailData,
          message_id: String(envelope.messageId ?? "")
        });
      }

      return results;
    } finally {
      await client.logout();
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const results = await this._fetchEmails();

    // Stream individual emails
    for (const item of results) {
      yield {
        email: item.email,
        message_id: item.message_id
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
    return {
      email: results[0]?.email ?? {},
      message_id: results[0]?.message_id ?? "",
      emails: results.map((r) => r.email),
      message_ids: results.map((r) => r.message_id)
    };
  }
}

export class AddLabelLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.AddLabel";
  static readonly title = "Add Label";
  static readonly description =
    "Adds a label to a Gmail message.\n    email, gmail, label";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const user = this._secrets["GOOGLE_MAIL_USER"];
    const pass = this._secrets["GOOGLE_APP_PASSWORD"];
    if (!user || !pass) {
      throw new Error(
        "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings."
      );
    }

    const messageId = String(this.message_id ?? "");
    const label = String(this.label ?? "");
    if (!messageId) throw new Error("Message ID is required");
    if (!label) throw new Error("Label is required");

    const client = await createImapClient(user, pass);
    try {
      await client.mailboxOpen("INBOX");

      // Find message by Message-ID header
      const results = await client.search({
        header: { "message-id": messageId }
      });

      if (!results || results.length === 0) {
        throw new Error(`Message not found: ${messageId}`);
      }

      // In Gmail, labels are mapped to IMAP folders/flags
      // Use COPY to add the message to the label folder
      await client.messageCopy(results, label);
      return { output: true };
    } finally {
      await client.logout();
    }
  }
}

export class MoveToArchiveLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.MoveToArchive";
  static readonly title = "Move To Archive";
  static readonly description =
    "Moves specified emails to Gmail archive.\n    email, gmail, archive";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly requiredSettings = [
    "GOOGLE_MAIL_USER",
    "GOOGLE_APP_PASSWORD"
  ];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Message Id",
    description: "Message ID to archive"
  })
  declare message_id: any;

  async process(): Promise<Record<string, unknown>> {
    const user = this._secrets["GOOGLE_MAIL_USER"];
    const pass = this._secrets["GOOGLE_APP_PASSWORD"];
    if (!user || !pass) {
      throw new Error(
        "GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD must be configured in settings."
      );
    }

    const messageId = String(this.message_id ?? "");
    if (!messageId) throw new Error("Message ID is required");

    const client = await createImapClient(user, pass);
    try {
      await client.mailboxOpen("INBOX");

      // Find message by Message-ID header
      const results = await client.search({
        header: { "message-id": messageId }
      });

      if (!results || results.length === 0) {
        throw new Error(`Message not found: ${messageId}`);
      }

      // In Gmail, archiving = moving to [Gmail]/All Mail (removing INBOX label)
      await client.messageMove(results, "[Gmail]/All Mail");
      return { output: true };
    } finally {
      await client.logout();
    }
  }
}

export const LIB_MAIL_NODES: readonly NodeClass[] = [
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode
] as const;
