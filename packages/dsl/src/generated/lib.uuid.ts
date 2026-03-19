// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Generate UUID4 — lib.uuid.GenerateUUID4
export interface GenerateUUID4Inputs {
}

export interface GenerateUUID4Outputs {
  output: string;
}

export function generateUUID4(inputs?: GenerateUUID4Inputs): DslNode<GenerateUUID4Outputs, "output"> {
  return createNode("lib.uuid.GenerateUUID4", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Generate UUID1 — lib.uuid.GenerateUUID1
export interface GenerateUUID1Inputs {
}

export interface GenerateUUID1Outputs {
  output: string;
}

export function generateUUID1(inputs?: GenerateUUID1Inputs): DslNode<GenerateUUID1Outputs, "output"> {
  return createNode("lib.uuid.GenerateUUID1", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Generate UUID3 — lib.uuid.GenerateUUID3
export interface GenerateUUID3Inputs {
  namespace?: Connectable<string>;
  name?: Connectable<string>;
}

export interface GenerateUUID3Outputs {
  output: string;
}

export function generateUUID3(inputs: GenerateUUID3Inputs): DslNode<GenerateUUID3Outputs, "output"> {
  return createNode("lib.uuid.GenerateUUID3", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Generate UUID5 — lib.uuid.GenerateUUID5
export interface GenerateUUID5Inputs {
  namespace?: Connectable<string>;
  name?: Connectable<string>;
}

export interface GenerateUUID5Outputs {
  output: string;
}

export function generateUUID5(inputs: GenerateUUID5Inputs): DslNode<GenerateUUID5Outputs, "output"> {
  return createNode("lib.uuid.GenerateUUID5", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Parse UUID — lib.uuid.ParseUUID
export interface ParseUUIDInputs {
  uuid_string?: Connectable<string>;
}

export interface ParseUUIDOutputs {
  output: Record<string, unknown>;
}

export function parseUUID(inputs: ParseUUIDInputs): DslNode<ParseUUIDOutputs, "output"> {
  return createNode("lib.uuid.ParseUUID", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Format UUID — lib.uuid.FormatUUID
export interface FormatUUIDInputs {
  uuid_string?: Connectable<string>;
  format?: Connectable<unknown>;
}

export interface FormatUUIDOutputs {
  output: string;
}

export function formatUUID(inputs: FormatUUIDInputs): DslNode<FormatUUIDOutputs, "output"> {
  return createNode("lib.uuid.FormatUUID", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Is Valid UUID — lib.uuid.IsValidUUID
export interface IsValidUUIDInputs {
  uuid_string?: Connectable<string>;
}

export interface IsValidUUIDOutputs {
  output: boolean;
}

export function isValidUUID(inputs: IsValidUUIDInputs): DslNode<IsValidUUIDOutputs, "output"> {
  return createNode("lib.uuid.IsValidUUID", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
