// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Validate Email — lib.validate.Email
export interface EmailInputs {
  value?: Connectable<string>;
}

export interface EmailOutputs {
  output: boolean;
}

export function email(inputs: EmailInputs): DslNode<EmailOutputs, "output"> {
  return createNode("lib.validate.Email", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Validate URL — lib.validate.URL
export interface URLInputs {
  value?: Connectable<string>;
}

export interface URLOutputs {
  output: boolean;
}

export function url(inputs: URLInputs): DslNode<URLOutputs, "output"> {
  return createNode("lib.validate.URL", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Validate IP Address — lib.validate.IP
export interface IPInputs {
  value?: Connectable<string>;
}

export interface IPOutputs {
  is_ip: boolean;
  is_ipv4: boolean;
  is_ipv6: boolean;
}

export function ip(inputs: IPInputs): DslNode<IPOutputs> {
  return createNode("lib.validate.IP", inputs as Record<string, unknown>, { outputNames: ["is_ip", "is_ipv4", "is_ipv6"] });
}

// Validate String — lib.validate.String
export interface StringInputs {
  value?: Connectable<string>;
}

export interface StringOutputs {
  is_email: boolean;
  is_url: boolean;
  is_uuid: boolean;
  is_json: boolean;
  is_numeric: boolean;
  is_alpha: boolean;
  is_alphanumeric: boolean;
}

export function string(inputs: StringInputs): DslNode<StringOutputs> {
  return createNode("lib.validate.String", inputs as Record<string, unknown>, { outputNames: ["is_email", "is_url", "is_uuid", "is_json", "is_numeric", "is_alpha", "is_alphanumeric"] });
}

// Sanitize String — lib.validate.Sanitize
export interface SanitizeInputs {
  value?: Connectable<string>;
}

export interface SanitizeOutputs {
  escaped: string;
  trimmed: string;
  normalized_email: string;
}

export function sanitize(inputs: SanitizeInputs): DslNode<SanitizeOutputs> {
  return createNode("lib.validate.Sanitize", inputs as Record<string, unknown>, { outputNames: ["escaped", "trimmed", "normalized_email"] });
}
