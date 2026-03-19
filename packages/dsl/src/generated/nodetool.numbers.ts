// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Filter Number — nodetool.numbers.FilterNumber
export interface FilterNumberInputs {
  value?: Connectable<number>;
  filter_type?: Connectable<unknown>;
  compare_value?: Connectable<number>;
}

export interface FilterNumberOutputs {
  output: number;
}

export function filterNumber(inputs: FilterNumberInputs): DslNode<FilterNumberOutputs, "output"> {
  return createNode("nodetool.numbers.FilterNumber", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}

// Filter Number Range — nodetool.numbers.FilterNumberRange
export interface FilterNumberRangeInputs {
  value?: Connectable<number>;
  min_value?: Connectable<number>;
  max_value?: Connectable<number>;
  inclusive?: Connectable<boolean>;
}

export interface FilterNumberRangeOutputs {
  output: number;
}

export function filterNumberRange(inputs: FilterNumberRangeInputs): DslNode<FilterNumberRangeOutputs, "output"> {
  return createNode("nodetool.numbers.FilterNumberRange", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
