/**
 * Tool for signaling step completion with a validated result.
 *
 * Port of src/nodetool/agents/tools/finish_step_tool.py
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

export class FinishStepTool extends Tool {
  readonly name = "finish_step";
  readonly description =
    "Call this tool when you have completed the step and have the final result ready. " +
    "This is the ONLY way to properly signal step completion. Do not output raw JSON blocks. " +
    "The result must conform to the step's declared output schema.";

  readonly inputSchema: Record<string, unknown>;

  constructor(outputSchema?: Record<string, unknown>) {
    super();
    if (outputSchema) {
      const schemaCopy = { ...outputSchema };
      if (
        schemaCopy["type"] === "object" &&
        !("additionalProperties" in schemaCopy)
      ) {
        schemaCopy["additionalProperties"] = false;
      }
      this.inputSchema = {
        type: "object",
        properties: {
          result: schemaCopy,
        },
        required: ["result"],
        additionalProperties: false,
      };
    } else {
      this.inputSchema = {
        type: "object",
        properties: {
          result: {
            type: "string",
            description: "The result of the step.",
          },
        },
        required: ["result"],
        additionalProperties: false,
      };
    }
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    // The actual completion handling is done in StepExecutor.
    // This method just returns the params for logging/history purposes.
    return params;
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Completing step with result...";
  }
}
