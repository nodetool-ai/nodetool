import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";

/**
 * Set Variable / Get Variable — read and write the workflow's shared
 * variables on the {@link ProcessingContext}.
 *
 * A single ProcessingContext is shared by every node in a run, so a value
 * written by {@link SetVariableNode} is visible to any node that runs after
 * it. Execution follows the graph's edges, so "after" means "downstream":
 * only nodes downstream of a Set Variable are guaranteed to observe its
 * value. The editor relies on this — a Prompt node offers a variable button,
 * and a Get Variable node offers a variable in its picker, only when the
 * setting node is upstream of it.
 */

export class SetVariableNode extends BaseNode {
  static readonly nodeType = "nodetool.variable.SetVariable";
  static readonly title = "Set Variable";
  static readonly description =
    "Stores a value in the workflow's shared variables under a name.\n" +
    "    variable, set, store, state, context, memory\n\n" +
    "    The value is written to the processing context so a node downstream " +
    "can read it by name — a Get Variable node, or a Prompt node referencing " +
    "{{ name }} — without an explicit wire for the value. The input value is " +
    "passed through to the output so this node can sit inline in a flow. " +
    "Only nodes downstream of this node are guaranteed to observe the value, " +
    "because execution follows the graph's edges.";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["value"];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description:
      "Name to store the value under in the workflow's shared variables."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "Value to store. Passed through unchanged to the output."
  })
  declare value: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const name = String(this.name ?? "").trim();
    if (!name) {
      throw new Error("Set Variable requires a non-empty variable name");
    }
    const value = this.value ?? null;
    context?.set(name, value);
    return { output: value };
  }
}

export class GetVariableNode extends BaseNode {
  static readonly nodeType = "nodetool.variable.GetVariable";
  static readonly title = "Get Variable";
  static readonly description =
    "Reads a value from the workflow's shared variables by name.\n" +
    "    variable, get, read, state, context, memory\n\n" +
    "    Returns the value written by a Set Variable node. Only variables set " +
    "by a Set Variable node UPSTREAM of this node are guaranteed to be " +
    "available, because execution follows the graph's edges — connect this " +
    "node downstream of the Set Variable (via the trigger input) so it runs " +
    "after the value is set. Unknown variables resolve to null.";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["trigger"];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description:
      "Name of the variable to read. Only variables set by a Set Variable " +
      "node upstream of this node are guaranteed to be available."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Trigger",
    description:
      "Optional ordering input. Connect a node that is downstream of the " +
      "Set Variable so this node runs after the variable is set. The value " +
      "itself is ignored."
  })
  declare trigger: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const name = String(this.name ?? "").trim();
    if (!name) {
      throw new Error("Get Variable requires a non-empty variable name");
    }
    return { output: context ? context.get(name, null) : null };
  }
}

export const VARIABLE_NODES = tagAsUniversal([
  SetVariableNode,
  GetVariableNode
]);
