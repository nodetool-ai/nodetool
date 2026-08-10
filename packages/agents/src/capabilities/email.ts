/**
 * The `email` capability module — Gmail over IMAP.
 *
 * Three capabilities that used to be three `Tool` subclasses in
 * `../tools/email-tools.ts`. Wire names, descriptions and schemas are
 * unchanged; the classes survive as thin subclasses over these
 * implementations.
 *
 * `imapflow` and `mailparser` are imported inside the connection helper and
 * the parse path rather than at module scope, so a run that never touches
 * email never loads an IMAP client.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ImapFlow } from "imapflow";
import type { CapabilityExport, CapabilityModule } from "./types.js";

function stripHtml(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n");
  // Strip tags until a pass removes nothing, so removed fragments cannot
  // reassemble into a new tag ("<scr<script>ipt>" → "<script>").
  for (;;) {
    const next = text.replace(/<[^>]*>/g, "");
    if (next === text) break;
    text = next;
  }
  return (
    text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Last, so "&amp;lt;" decodes once — to "&lt;", not to "<".
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

async function createGmailConnection(
  context: ProcessingContext
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

  const { ImapFlow: ImapFlowClient } = await import("imapflow");
  const client = new ImapFlowClient({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: emailAddress,
      pass: appPassword
    },
    logger: false
  });

  await client.connect();
  return client;
}

// ---------------------------------------------------------------------------
// search_email
// ---------------------------------------------------------------------------

const searchEmail: CapabilityExport = {
  spec: {
    name: "search_email",
    description:
      "Search Gmail by subject, text, and date. Returns a list of emails with message_id, subject, sender, and body.",
    inputSchema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Text to search for in email subject"
        },
        since_hours_ago: {
          type: "integer",
          description: "Number of hours ago to search for",
          default: 6
        },
        text: {
          type: "string",
          description: "General text to search for anywhere in the email"
        },
        max_results: {
          type: "integer",
          description: "Maximum number of emails to return",
          default: 50
        }
      }
    },
    category: "read",
    userMessage: (params) => {
      const parts: string[] = [];
      if (params.subject) parts.push(`subject: '${params.subject}'`);
      if (params.text) parts.push(`text: '${params.text}'`);
      if (params.since_hours_ago)
        parts.push(`since: ${params.since_hours_ago} hours ago`);
      const queryStr = parts.length > 0 ? parts.join(", ") : "emails";
      const msg = `Searching ${queryStr}...`;
      return msg.length > 80 ? "Searching emails..." : msg;
    }
  },
  impl: async (run, params) => {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(run.context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        const { simpleParser } = await import("mailparser");
        const searchCriteria: Record<string, unknown> = {};

        if (params.subject) {
          searchCriteria.subject = params.subject as string;
        }
        if (params.text) {
          searchCriteria.body = params.text as string;
        }

        const sinceHours = (params.since_hours_ago as number) ?? 6;
        const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
        searchCriteria.since = sinceDate;

        const uids = await client.search(searchCriteria, { uid: true });

        if (!uids || uids.length === 0) {
          return [];
        }

        // Newest first
        uids.reverse();

        const maxResults = Math.min(
          uids.length,
          (params.max_results as number) ?? 50
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
          { uid: true }
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
            body
          });
        }

        return results;
      } finally {
        lock.release();
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {
          /* Intentional: best-effort IMAP logout during cleanup */
        });
      }
    }
  }
};

// ---------------------------------------------------------------------------
// archive_email
// ---------------------------------------------------------------------------

const archiveEmail: CapabilityExport = {
  spec: {
    name: "archive_email",
    description: "Move specified emails to Gmail archive",
    inputSchema: {
      type: "object",
      properties: {
        message_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of message IDs to archive"
        }
      },
      required: ["message_ids"]
    },
    category: "external",
    userMessage: (params) => {
      const ids = (params.message_ids as string[]) ?? [];
      return ids.length === 1
        ? `Archiving email ${ids[0]}...`
        : `Archiving ${ids.length} emails...`;
    }
  },
  impl: async (run, params) => {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(run.context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        let messageIds = params.message_ids as string | string[];
        if (typeof messageIds === "string") {
          messageIds = [messageIds];
        }

        const archivedIds: string[] = [];
        for (const id of messageIds) {
          try {
            // Archiving in Gmail = removing the message from INBOX. `\Inbox` is
            // not an IMAP flag, so messageFlagsRemove was a silent no-op; move
            // the message to [Gmail]/All Mail, which drops the Inbox label.
            const moved = await client.messageMove(id, "[Gmail]/All Mail", {
              uid: true
            });
            // messageMove resolves even when nothing matched; only report
            // messages the server actually moved.
            if (moved) {
              archivedIds.push(id);
            }
          } catch {
            // Skip failed messages
          }
        }

        return {
          success: true,
          archived_messages: archivedIds
        };
      } finally {
        lock.release();
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {
          /* Intentional: best-effort IMAP logout during cleanup */
        });
      }
    }
  }
};

// ---------------------------------------------------------------------------
// add_label_to_email
// ---------------------------------------------------------------------------

const addLabelToEmail: CapabilityExport = {
  spec: {
    name: "add_label_to_email",
    description: "Add a label to a Gmail message",
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "Message ID to label"
        },
        label: {
          type: "string",
          description: "Label to add to the message"
        }
      },
      required: ["message_id", "label"]
    },
    category: "external",
    userMessage: (params) => {
      const label = (params.label as string) ?? "a label";
      const msg = `Adding label '${label}' to email ${params.message_id}...`;
      return msg.length > 80 ? `Adding label '${label}' to email...` : msg;
    }
  },
  impl: async (run, params) => {
    let client: ImapFlow | null = null;
    try {
      client = await createGmailConnection(run.context);
      const lock = await client.getMailboxLock("INBOX");

      try {
        const messageId = params.message_id as string;
        const label = params.label as string;

        await client.messageFlagsAdd(messageId, [label], { uid: true });

        return {
          success: true,
          message_id: messageId,
          label
        };
      } finally {
        lock.release();
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (client) {
        await client.logout().catch(() => {
          /* Intentional: best-effort IMAP logout during cleanup */
        });
      }
    }
  }
};

/** Every email capability, in the order email-tools.ts declared them. */
export const EMAIL_CAPABILITIES: readonly CapabilityExport[] = [
  searchEmail,
  archiveEmail,
  addLabelToEmail
];

export const module: CapabilityModule = {
  module: "email",
  exports: EMAIL_CAPABILITIES
};

export { searchEmail, archiveEmail, addLabelToEmail };
