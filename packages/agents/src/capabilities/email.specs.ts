/**
 * The `email` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `email.ts`, so nothing the
 * implementations pull in reaches the entry graph. `email.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";

export const searchEmailSpec: CapabilitySpec = {
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
};

export const archiveEmailSpec: CapabilitySpec = {
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
};

export const addLabelToEmailSpec: CapabilitySpec = {
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
};

/** Every spec this module declares, in declaration order. */
export const emailSpecs: readonly CapabilitySpec[] = [
  searchEmailSpec,
  archiveEmailSpec,
  addLabelToEmailSpec
];
