import { BaseNode, prop } from "@nodetool/node-sdk";
import type { StreamingInputs, StreamingOutputs } from "@nodetool/node-sdk";

export class IfNode extends BaseNode {
  static readonly nodeType = "nodetool.control.If";
  static readonly title = "If";
  static readonly description =
    "Conditionally executes one of two branches based on a condition.\n    control, flow, condition, logic, else, true, false, switch, toggle, flow-control\n\n    Use cases:\n    - Branch workflow based on conditions\n    - Handle different cases in data processing\n    - Implement decision logic";
  static readonly metadataOutputTypes = {
    if_true: "any",
    if_false: "any"
  };

  static readonly isStreamingOutput = true;
  static readonly syncMode = "zip_all" as const;
  @prop({
    type: "bool",
    default: false,
    title: "Condition",
    description: "The condition to evaluate"
  })
  declare condition: any;

  @prop({
    type: "any",
    default: [],
    title: "Value",
    description: "The value to pass to the next node"
  })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const condition = Boolean(this.condition ?? this.condition ?? false);
    const value = this.value ?? this.value ?? null;

    if (condition) {
      return { if_true: value, if_false: null };
    }
    return { if_true: null, if_false: value };
  }
}

export class ForEachNode extends BaseNode {
  static readonly nodeType = "nodetool.control.ForEach";
  static readonly title = "For Each";
  static readonly description =
    "Iterate over a list and emit each item sequentially.\n    iterator, loop, list, sequence, repeat, enumerate, stream, collection\n\n    Use cases:\n    - Process each item of a collection in order\n    - Drive downstream nodes with individual elements";
  static readonly metadataOutputTypes = {
    output: "any",
    index: "int"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "list[any]",
    default: [],
    title: "Input List",
    description: "The list of items to iterate over."
  })
  declare input_list: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const values = (this.input_list ?? this.input_list ?? []) as unknown[];
    const list = Array.isArray(values) ? values : [values];

    for (const [index, item] of list.entries()) {
      yield { output: item, index };
    }
  }
}

export class CollectNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Collect";
  static readonly title = "Collect";
  static readonly description =
    "Collect items until the end of the stream and return them as a list.\n    collector, aggregate, list, stream\n\n    Use cases:\n    - Gather results from multiple processing steps\n    - Collect streaming data into batches\n    - Aggregate outputs from parallel operations";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };

  static readonly syncMode = "on_any" as const;
  static readonly isStreamingInput = true;

  @prop({
    type: "any",
    default: [],
    title: "Input Item",
    description: "The input item to collect."
  })
  declare input_item: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: [] };
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const items: unknown[] = [];
    for await (const item of inputs.stream("input_item")) {
      items.push(item);
    }
    await outputs.emit("output", items);
  }
}

export class RerouteNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Reroute";
  static readonly title = "Reroute";
  static readonly description =
    "Pass data through unchanged for tidier workflow layouts.\n    reroute, passthrough, organize, tidy, flow, connection, redirect\n\n    Use cases:\n    - Organize complex workflows by routing connections\n    - Create cleaner visual layouts\n    - Redirect data flow without modification";
  static readonly metadataOutputTypes = {
    output: "any"
  };

  static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;
  @prop({
    type: "any",
    default: [],
    title: "Input Value",
    description: "Value to pass through unchanged"
  })
  declare input_value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.input_value ?? this.input_value ?? null };
  }
}

export class SwitchNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Switch";
  static readonly title = "Switch";
  static readonly description =
    "Multi-branch routing: match a value against cases and route to the matching output.\n    control, switch, match, case, branch, route, multi-branch, flow-control\n\n    Use cases:\n    - Route data based on string/number matching\n    - Implement multi-way branching logic\n    - Replace chains of If nodes";
  static readonly metadataOutputTypes = {
    matched: "any",
    default: "any",
    index: "int"
  };

  @prop({
    type: "any",
    default: "",
    title: "Value",
    description: "The value to match against cases."
  })
  declare value: any;

  @prop({
    type: "list[any]",
    default: [],
    title: "Cases",
    description: "List of values to match against. The first match wins."
  })
  declare cases: any;

  @prop({
    type: "any",
    default: null,
    title: "Input",
    description: "The data to route to the matched output."
  })
  declare input: any;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value;
    const cases = Array.isArray(this.cases) ? this.cases : [];
    const input = this.input ?? null;

    for (let i = 0; i < cases.length; i++) {
      if (String(value) === String(cases[i])) {
        return { matched: input, default: null, index: i };
      }
    }
    return { matched: null, default: input, index: -1 };
  }
}

export class TryCatchNode extends BaseNode {
  static readonly nodeType = "nodetool.control.TryCatch";
  static readonly title = "Try / Catch";
  static readonly description =
    "Error handling wrapper: passes the value through on success, or returns error info on failure.\n    control, error, try, catch, exception, handling, retry, flow-control\n\n    Use cases:\n    - Gracefully handle errors in workflows\n    - Provide fallback values when operations fail\n    - Log error details for debugging";
  static readonly metadataOutputTypes = {
    output: "any",
    error: "str",
    has_error: "bool"
  };

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "The value to pass through. If this node receives an error signal, the fallback is used."
  })
  declare value: any;

  @prop({
    type: "any",
    default: null,
    title: "Fallback",
    description: "Value to return if an error occurs."
  })
  declare fallback: any;

  async process(): Promise<Record<string, unknown>> {
    try {
      const value = this.value;
      if (value !== null && value !== undefined) {
        return { output: value, error: "", has_error: false };
      }
      return { output: this.fallback ?? null, error: "Value is null or undefined", has_error: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { output: this.fallback ?? null, error: message, has_error: true };
    }
  }
}

export const CONTROL_NODES = [
  IfNode,
  ForEachNode,
  CollectNode,
  RerouteNode,
  SwitchNode,
  TryCatchNode
] as const;
