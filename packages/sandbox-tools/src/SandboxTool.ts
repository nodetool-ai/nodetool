/**
 * SandboxTool — bridges a sandbox ToolClient method into an
 * @nodetool-ai/agents Tool.
 *
 * Each instance wraps exactly one sandbox tool; the manifest in
 * `./manifest.ts` instantiates one SandboxTool per sandbox surface
 * method. Input validation is delegated to the ToolClient (which
 * re-validates against the shared Zod schema), so the Tool's
 * `inputSchema` field here is purely for the LLM provider — we convert
 * the Zod schema via `z.toJSONSchema()`.
 */

import { z } from "zod";
import { Tool } from "@nodetool-ai/agents/tool";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ToolClient } from "@nodetool-ai/sandbox";

export interface SandboxToolDefinition<TIn, TOut> {
  /** Tool name as exposed to the LLM. */
  name: string;
  /** Human-readable description shown to the LLM. */
  description: string;
  /** Input schema used for BOTH the JSON-schema (LLM) and runtime validation. */
  inputSchema: z.ZodType<TIn>;
  /** Invoke the ToolClient. */
  invoke: (client: ToolClient, input: TIn) => Promise<TOut>;
  /** Optional status-line formatter. */
  renderStatus?: (input: TIn) => string;
}

export class SandboxTool<TIn = unknown, TOut = unknown> extends Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: Record<string, unknown>;

  private readonly client: ToolClient;
  private readonly def: SandboxToolDefinition<TIn, TOut>;

  constructor(client: ToolClient, def: SandboxToolDefinition<TIn, TOut>) {
    super();
    this.client = client;
    this.def = def;
    this.name = def.name;
    this.description = def.description;
    this.inputSchema = toJsonSchema(def.inputSchema);
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const parsed = this.def.inputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        error: "invalid input",
        issues: parsed.error.issues
      };
    }
    try {
      return await this.def.invoke(this.client, parsed.data);
    } catch (err: unknown) {
      const message =
        err !== null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      return { error: message };
    }
  }

  override userMessage(params: Record<string, unknown>): string {
    if (this.def.renderStatus) {
      try {
        const parsed = this.def.inputSchema.safeParse(params);
        if (parsed.success) return this.def.renderStatus(parsed.data);
      } catch {
        // fall through
      }
    }
    return `Running ${this.name}`;
  }
}

/**
 * Convert a Zod schema into a plain JSON-schema object suitable for
 * passing to an LLM provider. Normalizes the output by stripping Zod's
 * `$schema` key (providers don't consume it) and ensuring `type` is
 * present — some providers refuse an untyped object.
 */
export function toJsonSchema(
  schema: z.ZodType<unknown>
): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  const { $schema: _s, ...rest } = raw;
  if (!("type" in rest)) rest.type = "object";
  return rest;
}
