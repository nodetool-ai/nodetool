/**
 * Email tools for Gmail IMAP operations.
 *
 * Port of src/nodetool/agents/tools/email_tools.py
 */

import { Tool } from "./base-tool.js";
import type { ProcessingContext } from "@nodetool/runtime";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function createGmailConnection(
  context: ProcessingContext,
): Promise<ImapFlow> {
  const emailAddress =
    (await context.getSecret("GOOGLE_MAIL_USER")) ??
    process.env.GOOGLE_MAIL_USER;
  const appPassword =
    (await context.getSecret("GOOGLE_APP_PASSWORD")) ??
    process.env.GOOGLE_APP_PASSWORD;

  if (!emailAddress) {
    throw new Error("GOOGLE_MAIL_USER is not set");
  }
  if (!appPassword) {
    throw new Error("GOOGLE_APP_PASSWORD is not set");
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: emailAddress,
      pass: appPassword,
    },
    logger: false as any,
  });

  await client.connect();
  return client;
}

export class SearchEmailTool extends Tool {
  readonly name = "search_email";
  readonly description =
    "Search Gmail by subject, text, and date. Returns a list of emails with message_id, subject, sender, and body.";
  readonly inputSchema = {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Text to search for in email subject",
      },
      since_hours_ago: {
        type: "integer",
        description: "Number of hours ago to search for",
        default: 6,
      },
      text: {
        type: "string",
        description: "General text to search for anywhere in the email",
      },
      max_results: {
        type: "integer",
        description: "Maximum number of emails to return",
        default: 50,
      },
    },
  };

  userMessage(params: Record<string, unknown>): string {
    const parts: string[] = [];
    if (params.subject) parts.push(`subject: '${params.subject}'`);
    if (params.text) parts.push(`text: '${params.text}'`);
    if (params.since_hours_ago)
      parts.push(`since: ${params.since_hours_ago} hours ago`);
    const queryStr = parts.length > 0 ? parts.join(", ") : "emails";
    const msg = `Searching ${queryStr}...`;
    return msg.length > 80 ? "Searching emails..." : msg;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        const searchCriteria: Record<string, unknown> = {};

        if (params.subject) {
          searchCriteria.subject = params.subject as string;
        }
        if (params.text) {
          searchCriteria.body = params.text as string;
        }

        const sinceHours = (params.since_hours_ago as number) ?? 6;
        const sinceDate = new Date(
          Date.now() - sinceHours * 60 * 60 * 1000,
        );
        searchCriteria.since = sinceDate;

        const uids = await client.search(searchCriteria, { uid: true });

        if (!uids || uids.length === 0) {
          return [];
        }

        // Newest first
        uids.reverse();

        const maxResults = Math.min(
          uids.length,
          (params.max_results as number) ?? 50,
        );
        const selectedUids = uids.slice(0, maxResults);

        const results: Array<{
          message_id: string;
          subject: string;
          sender: string;
          body: string;
        }> = [];

        for await (const msg of client.fetch(
          selectedUids.map(String).join(","),
          { source: true, uid: true },
          { uid: true },
        )) {
          const parsed = await simpleParser(msg.source ?? Buffer.alloc(0));
          let body = "";
          if (parsed.html) {
            body = stripHtml(parsed.html);
          } else if (parsed.text) {
            body = parsed.text;
          }

          results.push({
            message_id: String(msg.uid),
            subject: parsed.subject ?? "",
            sender: parsed.from?.text ?? "",
            body,
          });
        }

        return results;
      } finally {
        lock.release();
      }
    } catch (e: any) {
      return { error: e.message ?? String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {});
      }
    }
  }
}

export class ArchiveEmailTool extends Tool {
  readonly name = "archive_email";
  readonly description = "Move specified emails to Gmail archive";
  readonly inputSchema = {
    type: "object",
    properties: {
      message_ids: {
        type: "array",
        items: { type: "string" },
        description: "List of message IDs to archive",
      },
    },
    required: ["message_ids"],
  };

  userMessage(params: Record<string, unknown>): string {
    const ids = (params.message_ids as string[]) ?? [];
    return ids.length === 1
      ? `Archiving email ${ids[0]}...`
      : `Archiving ${ids.length} emails...`;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        let messageIds = params.message_ids as string | string[];
        if (typeof messageIds === "string") {
          messageIds = [messageIds];
        }

        const archivedIds: string[] = [];
        for (const id of messageIds) {
          try {
            await client.messageFlagsRemove(id, ["\\Inbox"], { uid: true });
            archivedIds.push(id);
          } catch {
            // Skip failed messages
          }
        }

        return {
          success: true,
          archived_messages: archivedIds,
        };
      } finally {
        lock.release();
      }
    } catch (e: any) {
      return { error: e.message ?? String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {});
      }
    }
  }
}

export class AddLabelToEmailTool extends Tool {
  readonly name = "add_label_to_email";
  readonly description = "Add a label to a Gmail message";
  readonly inputSchema = {
    type: "object",
    properties: {
      message_id: {
        type: "string",
        description: "Message ID to label",
      },
      label: {
        type: "string",
        description: "Label to add to the message",
      },
    },
    required: ["message_id", "label"],
  };

  userMessage(params: Record<string, unknown>): string {
    const label = (params.label as string) ?? "a label";
    const msg = `Adding label '${label}' to email ${params.message_id}...`;
    return msg.length > 80 ? `Adding label '${label}' to email...` : msg;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        const messageId = params.message_id as string;
        const label = params.label as string;

        await client.messageFlagsAdd(messageId, [label], { uid: true });

        return {
          success: true,
          message_id: messageId,
          label,
        };
      } finally {
        lock.release();
      }
    } catch (e: any) {
      return { error: e.message ?? String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {});
      }
    }
  }
}
