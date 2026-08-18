// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Gmail Search — lib.mail.GmailSearch
export type GmailSearchInputs = {
  from_address?: string;
  to_address?: string;
  subject?: string;
  body?: string;
  date_filter?: "SINCE_ONE_HOUR" | "SINCE_ONE_DAY" | "SINCE_ONE_WEEK" | "SINCE_ONE_MONTH" | "SINCE_ONE_YEAR";
  keywords?: string;
  folder?: "INBOX" | "[Gmail]/Sent Mail" | "[Gmail]/Drafts" | "[Gmail]/Spam" | "[Gmail]/Trash";
  text?: string;
  max_results?: number;
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

export function gmailSearch(inputs: GmailSearchInputs): Promise<GmailSearchOutputs> {
  return callNode<GmailSearchOutputs>("lib.mail.GmailSearch", inputs);
}

gmailSearch.stream = function (inputs: GmailSearchInputs): AsyncIterable<Partial<GmailSearchOutputs>> {
  return streamNode<Partial<GmailSearchOutputs>>("lib.mail.GmailSearch", inputs);
};

// Add Label — lib.mail.AddLabel
export type AddLabelInputs = {
  message_id?: string;
  label?: string;
};

export interface AddLabelOutputs {
  output: boolean;
}

export function addLabel(inputs: AddLabelInputs): Promise<AddLabelOutputs> {
  return callNode<AddLabelOutputs>("lib.mail.AddLabel", inputs);
}

// Move To Archive — lib.mail.MoveToArchive
export type MoveToArchiveInputs = {
  message_id?: string;
};

export interface MoveToArchiveOutputs {
  output: boolean;
}

export function moveToArchive(inputs: MoveToArchiveInputs): Promise<MoveToArchiveOutputs> {
  return callNode<MoveToArchiveOutputs>("lib.mail.MoveToArchive", inputs);
}
