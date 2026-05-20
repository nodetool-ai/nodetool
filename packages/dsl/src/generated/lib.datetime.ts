// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Now — lib.datetime.Now
export interface NowInputs {
}

export interface NowOutputs {
  iso: string;
  epoch_ms: number;
  date: unknown;
}

export function now(inputs?: NowInputs): DslNode<NowOutputs> {
  return createNode("lib.datetime.Now", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["iso", "epoch_ms", "date"] });
}

// Format Date — lib.datetime.Format
export interface FormatInputs {
  date?: Connectable<unknown>;
  pattern?: Connectable<string>;
}

export interface FormatOutputs {
  formatted: string;
  iso: string;
  epoch_ms: number;
}

export function format(inputs: FormatInputs): DslNode<FormatOutputs> {
  return createNode("lib.datetime.Format", inputs as Record<string, unknown>, { outputNames: ["formatted", "iso", "epoch_ms"] });
}

// Add / Subtract Time — lib.datetime.Add
export interface AddInputs {
  date?: Connectable<unknown>;
  amount?: Connectable<number>;
  unit?: Connectable<"millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year">;
}

export interface AddOutputs {
  iso: string;
  epoch_ms: number;
  date: unknown;
}

export function add(inputs: AddInputs): DslNode<AddOutputs> {
  return createNode("lib.datetime.Add", inputs as Record<string, unknown>, { outputNames: ["iso", "epoch_ms", "date"] });
}

// Date Difference — lib.datetime.Diff
export interface DiffInputs {
  date_a?: Connectable<unknown>;
  date_b?: Connectable<unknown>;
  unit?: Connectable<"millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year">;
}

export interface DiffOutputs {
  diff: number;
  is_before: boolean;
  is_after: boolean;
  is_same: boolean;
}

export function diff(inputs: DiffInputs): DslNode<DiffOutputs> {
  return createNode("lib.datetime.Diff", inputs as Record<string, unknown>, { outputNames: ["diff", "is_before", "is_after", "is_same"] });
}

// Start / End of Period — lib.datetime.StartEnd
export interface StartEndInputs {
  date?: Connectable<unknown>;
  unit?: Connectable<"millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year">;
}

export interface StartEndOutputs {
  start_iso: string;
  end_iso: string;
  start: unknown;
  end: unknown;
}

export function startEnd(inputs: StartEndInputs): DslNode<StartEndOutputs> {
  return createNode("lib.datetime.StartEnd", inputs as Record<string, unknown>, { outputNames: ["start_iso", "end_iso", "start", "end"] });
}
