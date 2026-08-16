/**
 * Declarative tool library shared by the planning eval suites.
 *
 * Both planner suites score a *plan*, never an execution, so these tools are
 * never called — the planner only sees their names and descriptions and
 * decides which step (or which `opts.tools` restriction) should use them.
 * Calling one throws, which keeps a suite honest: a harness that accidentally
 * starts executing plans fails loudly instead of silently scoring an
 * execution.
 *
 * The set covers the interaction shapes a planner has to route between:
 * retrieval (`web_search`, `fetch_page`), storage (`write_file`, `read_file`),
 * deterministic compute (`run_python`), and media generation
 * (`generate_image`).
 */

import type { ProcessingContext, JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";

/** A tool the planner may reference by name but that is never executed. */
class DeclarativeTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly jsonSchema: JsonSchema;

  constructor(name: string, description: string, schema: JsonSchema) {
    super();
    this.name = name;
    this.description = description;
    this.jsonSchema = schema;
  }

  async process(
    _context: ProcessingContext,
    _params: Record<string, unknown>
  ): Promise<never> {
    throw new Error(
      `${this.name} is a planning-eval placeholder and must never be executed`
    );
  }
}

const stringArg = (name: string, description: string): JsonSchema => ({
  type: "object",
  properties: { [name]: { type: "string", description } },
  required: [name],
  additionalProperties: false
});

/** Tool names the planning suites expose, in the order they are offered. */
export const PLANNER_TOOL_NAMES = [
  "web_search",
  "fetch_page",
  "read_file",
  "write_file",
  "run_python",
  "generate_image"
] as const;

/** Fresh instances of the planning toolset (one set per eval case). */
export function createPlannerTools(): Tool[] {
  return [
    new DeclarativeTool(
      "web_search",
      "Search the web and return a list of result titles, URLs, and snippets.",
      stringArg("query", "Search query.")
    ),
    new DeclarativeTool(
      "fetch_page",
      "Fetch one URL and return its readable text content.",
      stringArg("url", "Absolute URL to fetch.")
    ),
    new DeclarativeTool(
      "read_file",
      "Read a UTF-8 text file from the workspace.",
      stringArg("path", "Workspace-relative path.")
    ),
    new DeclarativeTool(
      "write_file",
      "Write a UTF-8 text file to the workspace.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path." },
          content: { type: "string", description: "File contents." }
        },
        required: ["path", "content"],
        additionalProperties: false
      }
    ),
    new DeclarativeTool(
      "run_python",
      "Run a Python snippet for deterministic computation and return its stdout.",
      stringArg("code", "Python source to execute.")
    ),
    new DeclarativeTool(
      "generate_image",
      "Generate one image from a text prompt and return its asset reference.",
      stringArg("prompt", "Image prompt.")
    )
  ];
}
