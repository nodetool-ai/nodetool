/**
 * The `Tool` door into the gate: `gateTools` wraps each tool so its
 * `process()` runs the one ladder in `invoke.ts`.
 *
 * This lives in `capabilities/`, not beside the classification map in
 * `tools/tool-permissions.ts`, because the import edge must stay one-way:
 * capabilities import the map, never the reverse. The reverse edge turned the
 * bundled backend's module wrappers into an async cycle —
 * `init_tool_permissions` awaiting `init_adapters` awaiting
 * `init_tool_permissions` — which esbuild's `__esm` cannot break the way real
 * ESM breaks a synchronous cycle, and `server.mjs` died on an unsettled
 * top-level await before serving `/health`.
 */

import type { ProcessingContext, ProviderTool } from "@nodetool-ai/runtime";
import type { ZodType } from "zod";
import { Tool } from "../tools/base-tool.js";
import type { PermissionGateOptions } from "../tools/tool-permissions.js";
import { capabilityFromTool } from "./adapters.js";
import { createCapabilityRun } from "./invoke.js";

/**
 * Transparent permission wrapper around a {@link Tool}. Identity, schema and
 * message template are the inner tool's, unchanged; only `process()` differs,
 * and it does nothing itself — it builds a one-call `CapabilityRun` over a
 * capability view of the tool and lets `invoke` run the ladder. There is one
 * ladder, and this is the door a `Tool` walks through it.
 */
class GatedCapabilityTool extends Tool {
  override readonly needsToolCallId: boolean;

  constructor(
    private readonly inner: Tool,
    private readonly gate: PermissionGateOptions
  ) {
    super();
    this.needsToolCallId = inner.needsToolCallId;
  }

  get name(): string {
    return this.inner.name;
  }

  get description(): string {
    return this.inner.description;
  }

  override get schema(): ZodType | undefined {
    return this.inner.schema;
  }

  override get inputSchema(): Record<string, unknown> {
    return this.inner.inputSchema;
  }

  override toProviderTool(): ProviderTool {
    return this.inner.toProviderTool();
  }

  override userMessage(params: Record<string, unknown>): string {
    return this.inner.userMessage(params);
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const capability = capabilityFromTool(this.inner);
    const run = createCapabilityRun({
      context,
      gate: this.gate,
      capabilities: [capability]
    });
    return run.invoke(capability.spec.name, params);
  }
}

/** Wrap each tool so its `process()` runs through the permission gate. */
export function gateTools(
  tools: Tool[],
  options: PermissionGateOptions
): Tool[] {
  return tools.map((tool) => new GatedCapabilityTool(tool, options));
}
