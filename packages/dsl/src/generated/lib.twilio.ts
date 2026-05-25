// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Send SMS — lib.twilio.SendSMS
export interface SendSMSInputs {
  to?: Connectable<string>;
  from_number?: Connectable<string>;
  body?: Connectable<string>;
  account_sid?: Connectable<string>;
  auth_token?: Connectable<string>;
}

export interface SendSMSOutputs {
  output: Record<string, unknown>;
}

export function sendSMS(inputs: SendSMSInputs): DslNode<SendSMSOutputs, "output"> {
  return createNode("lib.twilio.SendSMS", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Send WhatsApp — lib.twilio.SendWhatsApp
export interface SendWhatsAppInputs {
  to?: Connectable<string>;
  from_number?: Connectable<string>;
  body?: Connectable<string>;
  account_sid?: Connectable<string>;
  auth_token?: Connectable<string>;
}

export interface SendWhatsAppOutputs {
  output: Record<string, unknown>;
}

export function sendWhatsApp(inputs: SendWhatsAppInputs): DslNode<SendWhatsAppOutputs, "output"> {
  return createNode("lib.twilio.SendWhatsApp", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Messages — lib.twilio.GetMessages
export interface GetMessagesInputs {
  limit?: Connectable<number>;
  to?: Connectable<string>;
  from_number?: Connectable<string>;
  date_sent?: Connectable<string>;
  account_sid?: Connectable<string>;
  auth_token?: Connectable<string>;
}

export interface GetMessagesOutputs {
  message: Record<string, unknown>;
  messages: unknown[];
}

export function getMessages(inputs: GetMessagesInputs): DslNode<GetMessagesOutputs> {
  return createNode("lib.twilio.GetMessages", inputs as Record<string, unknown>, { outputNames: ["message", "messages"], streaming: true });
}

// Lookup Phone Number — lib.twilio.Lookup
export interface LookupInputs {
  phone_number?: Connectable<string>;
  account_sid?: Connectable<string>;
  auth_token?: Connectable<string>;
}

export interface LookupOutputs {
  output: Record<string, unknown>;
}

export function lookup(inputs: LookupInputs): DslNode<LookupOutputs, "output"> {
  return createNode("lib.twilio.Lookup", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
