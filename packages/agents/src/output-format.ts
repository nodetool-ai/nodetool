/**
 * Shared output-format options for agents. When an agent runs in a non-
 * "structured" mode, outputSchema is ignored and a short directive is
 * appended to the system prompt so the final step emits the requested
 * presentation format.
 */

export type AgentOutputFormat = "structured" | "markdown" | "text" | "html";

export const OUTPUT_FORMAT_DIRECTIVES: Record<
  Exclude<AgentOutputFormat, "structured">,
  string
> = {
  markdown: "Final result: markdown prose.",
  text: "Final result: plain text.",
  html: "Final result: HTML fragment."
};

export function outputFormatDirective(format: AgentOutputFormat): string | null {
  if (format === "structured") return null;
  return OUTPUT_FORMAT_DIRECTIVES[format];
}
