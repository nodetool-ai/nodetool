/**
 * FinishTool — terminal tool emitted by AgentExecutor's value-based loop.
 *
 * The agent calls `finish_task` exactly once with `result` (typed by
 * outputType / outputSchema) and `metadata` (title, description, sources).
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

const METADATA_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    sources: { type: "array", items: { type: "string" } }
  },
  required: ["title", "description"],
  additionalProperties: true
};

export function jsonSchemaForOutputType(type: string): Record<string, unknown> {
  const schemas: Record<string, Record<string, unknown>> = {
    json: { type: "object", description: "JSON object" },
    list: { type: "array", description: "Array of values" },
    string: { type: "string", description: "Text string" },
    number: { type: "number", description: "Numeric value" },
    boolean: { type: "boolean", description: "Boolean value" },
    markdown: { type: "string", description: "Markdown formatted text" },
    html: { type: "string", description: "HTML markup" },
    csv: { type: "string", description: "CSV formatted data" },
    yaml: { type: "string", description: "YAML formatted data" }
  };
  return (
    schemas[type] ?? {
      type: "string",
      description: `Output of type ${type}`
    }
  );
}

export class FinishTool extends Tool {
  readonly name = "finish_task";
  readonly description =
    "Finish the task by providing the final result value and metadata.";
  readonly inputSchema: Record<string, unknown>;

  constructor(
    outputType: string,
    outputSchema: Record<string, unknown> | null
  ) {
    super();
    const resultSchema = outputSchema ?? jsonSchemaForOutputType(outputType);

    this.inputSchema = {
      type: "object",
      properties: {
        result: resultSchema,
        metadata: METADATA_SCHEMA
      },
      required: ["result", "metadata"],
      additionalProperties: false
    };
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return params;
  }
}
