// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

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

export function gmailSearch(inputs: GmailSearchInputs, options?: NodeOptions): NodeWithOutputs<GmailSearchOutputs> {
  return createNode("lib.mail.GmailSearch", inputs, { id: options?.id, outputNames: ["email", "message_id", "subject", "sender", "date", "body", "emails", "message_ids"], outputTypes: {"email":"dict","message_id":"str","subject":"str","sender":"str","date":"str","body":"str","emails":"list","message_ids":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"email":{"kind":"iteration","source":"__execution__","group":"items"},"message_id":{"kind":"iteration","source":"__execution__","group":"items"},"subject":{"kind":"iteration","source":"__execution__","group":"items"},"sender":{"kind":"iteration","source":"__execution__","group":"items"},"date":{"kind":"iteration","source":"__execution__","group":"items"},"body":{"kind":"iteration","source":"__execution__","group":"items"},"emails":{"kind":"single","source":"__execution__"},"message_ids":{"kind":"single","source":"__execution__"}} });
}

// Add Label — lib.mail.AddLabel
export type AddLabelInputs = {
  message_id?: Connectable<string>;
  label?: Connectable<string>;
};

export interface AddLabelOutputs {
  output: boolean;
}

export function addLabel(inputs: AddLabelInputs, options?: NodeOptions): NodeWithOutputs<AddLabelOutputs, "output"> {
  return createNode("lib.mail.AddLabel", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"bool"}, defaultOutput: "output" });
}

// Move To Archive — lib.mail.MoveToArchive
export type MoveToArchiveInputs = {
  message_id?: Connectable<string>;
};

export interface MoveToArchiveOutputs {
  output: boolean;
}

export function moveToArchive(inputs: MoveToArchiveInputs, options?: NodeOptions): NodeWithOutputs<MoveToArchiveOutputs, "output"> {
  return createNode("lib.mail.MoveToArchive", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"bool"}, defaultOutput: "output" });
}

// Send Email — lib.mail.SendEmail
export type SendEmailInputs = {
  to?: Connectable<string>;
  cc?: Connectable<string>;
  bcc?: Connectable<string>;
  subject?: Connectable<string>;
  text?: Connectable<string>;
  html?: Connectable<string>;
};

export interface SendEmailOutputs {
  message_id: string;
  accepted: string[];
  rejected: string[];
}

export function sendEmail(inputs: SendEmailInputs, options?: NodeOptions): NodeWithOutputs<SendEmailOutputs> {
  return createNode("lib.mail.SendEmail", inputs, { id: options?.id, outputNames: ["message_id", "accepted", "rejected"], outputTypes: {"message_id":"str","accepted":"list[str]","rejected":"list[str]"} });
}

// Email Trigger — lib.mail.EmailTrigger
export type EmailTriggerInputs = {
  folder?: Connectable<"INBOX" | "[Gmail]/Sent Mail" | "[Gmail]/Drafts" | "[Gmail]/Spam" | "[Gmail]/Trash">;
  from_address?: Connectable<string>;
  subject?: Connectable<string>;
  interval_seconds?: Connectable<number>;
  max_messages?: Connectable<number>;
};

export interface EmailTriggerOutputs {
  email: Record<string, unknown>;
  message_id: string;
  subject: string;
  sender: string;
  date: string;
  body: string;
  source: string;
  event_type: string;
}

export function emailTrigger(inputs: EmailTriggerInputs, options?: NodeOptions): NodeWithOutputs<EmailTriggerOutputs> {
  return createNode("lib.mail.EmailTrigger", inputs, { id: options?.id, outputNames: ["email", "message_id", "subject", "sender", "date", "body", "source", "event_type"], outputTypes: {"email":"dict","message_id":"str","subject":"str","sender":"str","date":"str","body":"str","source":"str","event_type":"str"}, streaming: true });
}
