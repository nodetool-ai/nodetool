// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Convert To Markdown — lib.convert.ConvertToMarkdown
export interface ConvertToMarkdownInputs {
  document?: Connectable<unknown>;
}

export interface ConvertToMarkdownOutputs {
  output: unknown;
}

export function convertToMarkdown(
  inputs: ConvertToMarkdownInputs
): DslNode<ConvertToMarkdownOutputs, "output"> {
  return createNode(
    "lib.convert.ConvertToMarkdown",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
