/**
 * Tool for signaling step completion with a validated result.
 *
 * Port of src/nodetool/agents/tools/finish_step_tool.py
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
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
      let resultSchema = { ...outputSchema };
      // OpenAI requires function parameter schemas to be type "object" at the
      // top level.  When the step declares an array output, wrap it so the
      // overall tool schema stays valid while the result value keeps its
      // intended array shape.
      if (resultSchema["type"] === "array") {
        resultSchema = {
          type: "object",
          description: resultSchema["description"] ?? "Result wrapper",
          properties: {
            items: resultSchema
          },
          required: ["items"],
          additionalProperties: false
        };
      }
      if (
        resultSchema["type"] === "object" &&
        !("additionalProperties" in resultSchema)
      ) {
        resultSchema["additionalProperties"] = false;
      }
      this.inputSchema = {
        type: "object",
        properties: {
          result: resultSchema
        },
        required: ["result"],
        additionalProperties: false
      };
    } else {
      this.inputSchema = {
        type: "object",
        properties: {
          result: {
            type: "string",
            description: "The result of the step."
          }
        },
        required: ["result"],
        additionalProperties: false
      };
    }
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    // The actual completion handling is done in StepExecutor.
    // This method just returns the params for logging/history purposes.
    return params;
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Completing step with result...";
  }
}
