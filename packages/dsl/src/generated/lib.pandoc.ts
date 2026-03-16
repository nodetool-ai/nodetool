// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Convert File — lib.pandoc.ConvertFile
export interface ConvertFileInputs {
  input_path?: Connectable<unknown>;
  input_format?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
  extra_args?: Connectable<string[]>;
}

export function convertFile(inputs: ConvertFileInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.pandoc.ConvertFile", inputs as Record<string, unknown>);
}

// Convert Text — lib.pandoc.ConvertText
export interface ConvertTextInputs {
  content?: Connectable<string>;
  input_format?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
  extra_args?: Connectable<string[]>;
}

export function convertText(inputs: ConvertTextInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.pandoc.ConvertText", inputs as Record<string, unknown>);
}
