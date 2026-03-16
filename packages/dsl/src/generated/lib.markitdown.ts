// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Convert To Markdown — lib.markitdown.ConvertToMarkdown
export interface ConvertToMarkdownInputs {
  document?: Connectable<unknown>;
}

export function convertToMarkdown(inputs: ConvertToMarkdownInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.markitdown.ConvertToMarkdown", inputs as Record<string, unknown>);
}
