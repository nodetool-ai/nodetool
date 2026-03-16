// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Generate UUID4 — lib.uuid.GenerateUUID4
export interface GenerateUUID4Inputs {
}

export function generateUUID4(inputs?: GenerateUUID4Inputs): DslNode<SingleOutput<string>> {
  return createNode("lib.uuid.GenerateUUID4", (inputs ?? {}) as Record<string, unknown>);
}

// Generate UUID1 — lib.uuid.GenerateUUID1
export interface GenerateUUID1Inputs {
}

export function generateUUID1(inputs?: GenerateUUID1Inputs): DslNode<SingleOutput<string>> {
  return createNode("lib.uuid.GenerateUUID1", (inputs ?? {}) as Record<string, unknown>);
}

// Generate UUID3 — lib.uuid.GenerateUUID3
export interface GenerateUUID3Inputs {
  namespace?: Connectable<string>;
  name?: Connectable<string>;
}

export function generateUUID3(inputs: GenerateUUID3Inputs): DslNode<SingleOutput<string>> {
  return createNode("lib.uuid.GenerateUUID3", inputs as Record<string, unknown>);
}

// Generate UUID5 — lib.uuid.GenerateUUID5
export interface GenerateUUID5Inputs {
  namespace?: Connectable<string>;
  name?: Connectable<string>;
}

export function generateUUID5(inputs: GenerateUUID5Inputs): DslNode<SingleOutput<string>> {
  return createNode("lib.uuid.GenerateUUID5", inputs as Record<string, unknown>);
}

// Parse UUID — lib.uuid.ParseUUID
export interface ParseUUIDInputs {
  uuid_string?: Connectable<string>;
}

export function parseUUID(inputs: ParseUUIDInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.uuid.ParseUUID", inputs as Record<string, unknown>);
}

// Format UUID — lib.uuid.FormatUUID
export interface FormatUUIDInputs {
  uuid_string?: Connectable<string>;
  format?: Connectable<unknown>;
}

export function formatUUID(inputs: FormatUUIDInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.uuid.FormatUUID", inputs as Record<string, unknown>);
}

// Is Valid UUID — lib.uuid.IsValidUUID
export interface IsValidUUIDInputs {
  uuid_string?: Connectable<string>;
}

export function isValidUUID(inputs: IsValidUUIDInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.uuid.IsValidUUID", inputs as Record<string, unknown>);
}
