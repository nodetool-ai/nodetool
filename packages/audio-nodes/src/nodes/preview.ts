/**
 * PreviewNode — display any value inside the workflow graph.
 *
 * Kept in its own browser-safe module (no `sharp` / `node:` / audio-codec
 * imports) so it can be registered in the in-browser node registry. Pure
 * pass-through graphs that end in a Preview then run client-side instead of
 * forcing a server round-trip. The class stays exported from `output.ts` and
 * registered server-side via `OUTPUT_NODES`.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";

export class PreviewNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.base_node.Preview";
  static readonly title = "Preview";
  static readonly description = "Preview values inside the workflow graph";
  static readonly inlineFields = [];
  static readonly inputFields = ["value"];

  @prop({ type: "any", default: null })
  declare value: any;

  @prop({ type: "str", default: "" })
  declare name: any;

  private async normalize(
    value: unknown,
    context?: ProcessingContext
  ): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function")
      return value;
    return context.normalizeOutputValue(value);
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const value = this.value ?? null;
    const normalized = await this.normalize(value, context);
    return { output: normalized };
  }
}

/** Preview runs both server- and browser-side. */
export const PREVIEW_NODES = tagAsHybrid([PreviewNode]);
