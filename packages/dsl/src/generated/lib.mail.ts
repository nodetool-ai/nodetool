// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Send Email — lib.mail.SendEmail
export interface SendEmailInputs {
  smtp_server?: Connectable<string>;
  smtp_port?: Connectable<number>;
  username?: Connectable<string>;
  password?: Connectable<string>;
  from_address?: Connectable<string>;
  to_address?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
}

export interface SendEmailOutputs {
  output: boolean;
}

export function sendEmail(inputs: SendEmailInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SendEmailOutputs, "output"> {
  return createNode("lib.mail.SendEmail", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Gmail Search — lib.mail.GmailSearch
export interface GmailSearchInputs {
  from_address?: Connectable<string>;
  to_address?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
  date_filter?: Connectable<"SINCE_ONE_HOUR" | "SINCE_ONE_DAY" | "SINCE_ONE_WEEK" | "SINCE_ONE_MONTH" | "SINCE_ONE_YEAR">;
  keywords?: Connectable<string>;
  folder?: Connectable<"INBOX" | "[Gmail]/Sent Mail" | "[Gmail]/Drafts" | "[Gmail]/Spam" | "[Gmail]/Trash">;
  text?: Connectable<string>;
  max_results?: Connectable<number>;
}

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

export function gmailSearch(inputs: GmailSearchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GmailSearchOutputs> {
  return createNode("lib.mail.GmailSearch", inputs as Record<string, unknown>, { outputNames: ["email", "message_id", "subject", "sender", "date", "body", "emails", "message_ids"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Add Label — lib.mail.AddLabel
export interface AddLabelInputs {
  message_id?: Connectable<string>;
  label?: Connectable<string>;
}

export interface AddLabelOutputs {
  output: boolean;
}

export function addLabel(inputs: AddLabelInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AddLabelOutputs, "output"> {
  return createNode("lib.mail.AddLabel", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Move To Archive — lib.mail.MoveToArchive
export interface MoveToArchiveInputs {
  message_id?: Connectable<string>;
}

export interface MoveToArchiveOutputs {
  output: boolean;
}

export function moveToArchive(inputs: MoveToArchiveInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MoveToArchiveOutputs, "output"> {
  return createNode("lib.mail.MoveToArchive", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
