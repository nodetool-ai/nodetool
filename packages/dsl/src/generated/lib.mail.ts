// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

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

export function sendEmail(inputs: SendEmailInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.mail.SendEmail", inputs as Record<string, unknown>);
}

// Gmail Search — lib.mail.GmailSearch
export interface GmailSearchInputs {
  from_address?: Connectable<string>;
  to_address?: Connectable<string>;
  subject?: Connectable<string>;
  body?: Connectable<string>;
  date_filter?: Connectable<unknown>;
  keywords?: Connectable<string>;
  folder?: Connectable<unknown>;
  text?: Connectable<string>;
  max_results?: Connectable<number>;
}

export interface GmailSearchOutputs {
  email: OutputHandle<Record<string, unknown>>;
  message_id: OutputHandle<string>;
}

export function gmailSearch(inputs: GmailSearchInputs): DslNode<GmailSearchOutputs> {
  return createNode("lib.mail.GmailSearch", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Add Label — lib.mail.AddLabel
export interface AddLabelInputs {
  message_id?: Connectable<string>;
  label?: Connectable<string>;
}

export function addLabel(inputs: AddLabelInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.mail.AddLabel", inputs as Record<string, unknown>);
}

// Move To Archive — lib.mail.MoveToArchive
export interface MoveToArchiveInputs {
  message_id?: Connectable<string>;
}

export function moveToArchive(inputs: MoveToArchiveInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.mail.MoveToArchive", inputs as Record<string, unknown>);
}
