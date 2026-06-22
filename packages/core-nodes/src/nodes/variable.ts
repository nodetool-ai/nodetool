import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";

/**
 * Set Variable / Get Variable — write and read named async channels on the
 * workflow's shared {@link ProcessingContext}.
 *
 * A Set Variable `send`s its value onto a channel; readers consume it without
 * an explicit graph edge. Because a reader *waits* on the channel rather than
 * relying on execution order, a Get Variable (or a Prompt referencing
 * `{{ name }}`) blocks until the value exists — no matter where the setter sits
 * in the graph. The runner closes a channel when its last Set Variable writer
 * finishes, so readers of a never-written variable end cleanly instead of
 * hanging.
 */

export class SetVariableNode extends BaseNode {
  static readonly nodeType = "nodetool.variable.SetVariable";
  static readonly title = "Set Variable";
  static readonly description =
    "Publishes a value to a named channel on the workflow's shared context.\n" +
    "    variable, set, store, state, context, channel\n\n" +
    "    A Get Variable node, or a Prompt referencing {{ name }}, reads the " +
    "value by name without an explicit wire — it waits until the value is " +
    "published. The input value is also passed through to the output so this " +
    "node can sit inline in a flow. Send multiple values (e.g. from a loop) to " +
    "stream them to readers.";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["value"];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name of the variable channel to publish the value on."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "Value to publish. Passed through unchanged to the output."
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
    context?.getChannel(name).send(value);
    return { output: value };
  }
}

export class GetVariableNode extends BaseNode {
  static readonly nodeType = "nodetool.variable.GetVariable";
  static readonly title = "Get Variable";
  static readonly description =
    "Reads a variable channel by name and streams its values.\n" +
    "    variable, get, read, state, context, channel\n\n" +
    "    Waits for the first value published by a Set Variable node anywhere in " +
    "the workflow, then emits every value it receives (a streaming output, so " +
    "a setter that publishes repeatedly fans those out here). Ends when all " +
    "Set Variable nodes for the name have finished; a name no one sets emits " +
    "nothing.";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["trigger"];

  static readonly isStreamingOutput = true;
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "iteration", source: "__execution__", group: "channel" }
  };

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name of the variable channel to read."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Trigger",
    description:
      "Optional input. Connect a node to gate when this node starts reading; " +
      "the value itself is ignored."
  })
  declare trigger: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const name = String(this.name ?? "").trim();
    if (!name) {
      throw new Error("Get Variable requires a non-empty variable name");
    }
    if (!context) {
      return;
    }
    for await (const value of context.getChannel(name).stream()) {
      yield { output: value };
    }
  }
}

export const VARIABLE_NODES = tagAsUniversal([
  SetVariableNode,
  GetVariableNode
]);
