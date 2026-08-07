import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { z } from "zod";
import { Tool } from "../../src/tools/base-tool.js";

const context = {} as ProcessingContext;

const LOOSE_TEXT_SCHEMA = z
  .object({
    expression: z.string().describe("The text to echo")
  })
  .loose();

/** A loose (additionalProperties-permitting) Zod-authored tool. */
class LooseTextTool extends Tool {
  readonly name = "loose_text";
  readonly description = "Loose test tool.";

  override get schema() {
    return LOOSE_TEXT_SCHEMA;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return { result: params.expression };
  }
}

const STRICT_NUMBER_SCHEMA = z.object({
  count: z.number().describe("Count to use")
}).strict();

class StrictNumberTool extends Tool {
  readonly name = "strict_number";
  readonly description = "Strict test tool.";

  override get schema() {
    return STRICT_NUMBER_SCHEMA;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return params;
  }
}

describe("Zod-authored tool schemas", () => {
  it("derives provider JSON Schema from a loose Zod schema", () => {
    const schema = new LooseTextTool().inputSchema;

    expect(schema).toMatchObject({
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The text to echo"
        }
      },
      required: ["expression"]
    });
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.additionalProperties).not.toBe(false);
  });

  it("rejects invalid arguments before process runs", async () => {
    const result = await new LooseTextTool().execute(context, {
      expression: 42
    });

    expect(result).toMatchObject({
      error: "invalid_tool_arguments"
    });
  });

  it("accepts valid arguments and strips the reserved message field", async () => {
    const result = await new LooseTextTool().execute(context, {
      expression: "2 + 2",
      _message: "Echoing expression"
    });

    expect(result).toEqual({ result: "2 + 2" });
  });

  it("coerces numeric strings for Zod-authored tools", async () => {
    const result = await new StrictNumberTool().execute(context, {
      count: "5"
    });

    expect(result).toEqual({ count: 5 });
  });

  it("keeps _message required for strict provider schemas", () => {
    const providerTool = new StrictNumberTool().toProviderTool();

    expect(providerTool.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ["count", "_message"]
    });
  });
});
