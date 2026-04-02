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

export class GmailSearchLibNode extends BaseNode {
  static readonly nodeType = "lib.mail.GmailSearch";
  static readonly title = "Gmail Search";
  static readonly description =
    "Searches Gmail using Gmail-specific search operators and yields matching emails.\n    email, gmail, search\n\n    Use cases:\n    - Search for emails based on specific criteria\n    - Retrieve emails from a specific sender\n    - Filter emails by subject, sender, or date";
  static readonly metadataOutputTypes = {
    email: "dict",
    message_id: "str"
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

  async process(): Promise<Record<string, unknown>> {
    throw new Error(
      "GmailSearch requires Google OAuth2/IMAP credentials which are not available in the TypeScript runtime. " +
        "Configure GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD environment variables and use the Python runtime."
    );
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
    throw new Error(
      "AddLabel requires Google OAuth2/IMAP credentials which are not available in the TypeScript runtime. " +
        "Configure GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD environment variables and use the Python runtime."
    );
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
    throw new Error(
      "MoveToArchive requires Google OAuth2/IMAP credentials which are not available in the TypeScript runtime. " +
        "Configure GOOGLE_MAIL_USER and GOOGLE_APP_PASSWORD environment variables and use the Python runtime."
    );
  }
}

export const LIB_MAIL_NODES: readonly NodeClass[] = [
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode
] as const;
