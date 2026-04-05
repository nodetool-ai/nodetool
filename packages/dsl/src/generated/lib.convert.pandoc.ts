// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Convert File — lib.convert.pandoc.ConvertFile
export interface ConvertFileInputs {
  input_path?: Connectable<unknown>;
  input_format?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
  extra_args?: Connectable<string[]>;
}

export interface ConvertFileOutputs {
  output: string;
}

export function convertFile(
  inputs: ConvertFileInputs
): DslNode<ConvertFileOutputs, "output"> {
  return createNode(
    "lib.convert.pandoc.ConvertFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Convert Text — lib.convert.pandoc.ConvertText
export interface ConvertTextInputs {
  content?: Connectable<string>;
  input_format?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
  extra_args?: Connectable<string[]>;
}

export interface ConvertTextOutputs {
  output: string;
}

export function convertText(
  inputs: ConvertTextInputs
): DslNode<ConvertTextOutputs, "output"> {
  return createNode(
    "lib.convert.pandoc.ConvertText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
