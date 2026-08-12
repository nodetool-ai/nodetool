// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Gmail Search — lib.mail.GmailSearch
export type GmailSearchInputs = {
  from_address?: Connectable<string>;
  to_address?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
  date_filter?: Connectable<"SINCE_ONE_HOUR" | "SINCE_ONE_DAY" | "SINCE_ONE_WEEK" | "SINCE_ONE_MONTH" | "SINCE_ONE_YEAR">;
  keywords?: Connectable<string>;
  folder?: Connectable<"INBOX" | "[Gmail]/Sent Mail" | "[Gmail]/Drafts" | "[Gmail]/Spam" | "[Gmail]/Trash">;
  text?: Connectable<string>;
  max_results?: Connectable<number>;
};

export interface GmailSearchOutputs {
  email: Record<string, unknown>;
  message_id: string;
  subject: string;
  sender: string;
  date: string;
  body: string;
  emails: unknown[];
  message_ids: unknown[];
}

export function gmailSearch(inputs: GmailSearchInputs): DslNode<GmailSearchOutputs> {
  return createNode("lib.mail.GmailSearch", inputs, { outputNames: ["email", "message_id", "subject", "sender", "date", "body", "emails", "message_ids"], streaming: true });
}

// Add Label — lib.mail.AddLabel
export type AddLabelInputs = {
  message_id?: Connectable<string>;
  label?: Connectable<string>;
};

export interface AddLabelOutputs {
  output: boolean;
}

export function addLabel(inputs: AddLabelInputs): DslNode<AddLabelOutputs, "output"> {
  return createNode("lib.mail.AddLabel", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Move To Archive — lib.mail.MoveToArchive
export type MoveToArchiveInputs = {
  message_id?: Connectable<string>;
};

export interface MoveToArchiveOutputs {
  output: boolean;
}

export function moveToArchive(inputs: MoveToArchiveInputs): DslNode<MoveToArchiveOutputs, "output"> {
  return createNode("lib.mail.MoveToArchive", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
