/**
 * Abstract base class for all agent tools.
 *
 * Port of src/nodetool/agents/tools/base.py
 */

import type { ProcessingContext } from "@nodetool/runtime";
import type { ProviderTool } from "@nodetool/runtime";

export abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, unknown>;

  /**
   * Execute the tool with the given parameters.
   */
  abstract process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown>;

  /**
   * Convert this tool to the provider tool format expected by BaseProvider.
   */
  toProviderTool(): ProviderTool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
  }

  /**
   * Return a user-facing message describing this tool call.
   */
  userMessage(_params: Record<string, unknown>): string {
    return `Running ${this.name}`;
  }
}
