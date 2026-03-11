import { BaseNode, prop } from "@nodetool/node-sdk";

export class IfNode extends BaseNode {
  static readonly nodeType = "nodetool.control.If";
            static readonly title = "If";
            static readonly description = "Conditionally executes one of two branches based on a condition.\n    control, flow, condition, logic, else, true, false, switch, toggle, flow-control\n\n    Use cases:\n    - Branch workflow based on conditions\n    - Handle different cases in data processing\n    - Implement decision logic";
        static readonly metadataOutputTypes = {
    if_true: "any",
    if_false: "any"
  };
  
            static readonly isStreamingOutput = true;
  static readonly syncMode = "zip_all" as const;
  @prop({ type: "bool", default: false, title: "Condition", description: "The condition to evaluate" })
  declare condition: any;

  @prop({ type: "any", default: [], title: "Value", description: "The value to pass to the next node" })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const condition = Boolean(inputs.condition ?? this.condition ?? false);
    const value = inputs.value ?? this.value ?? null;

    if (condition) {
      return { if_true: value, if_false: null };
    }
    return { if_true: null, if_false: value };
  }
}

export class ForEachNode extends BaseNode {
  static readonly nodeType = "nodetool.control.ForEach";
            static readonly title = "For Each";
            static readonly description = "Iterate over a list and emit each item sequentially.\n    iterator, loop, list, sequence, repeat, enumerate, stream, collection\n\n    Use cases:\n    - Process each item of a collection in order\n    - Drive downstream nodes with individual elements";
        static readonly metadataOutputTypes = {
    output: "any",
    index: "int"
  };
  
            static readonly isStreamingOutput = true;
  @prop({ type: "list[any]", default: [], title: "Input List", description: "The list of items to iterate over." })
  declare input_list: any;




  async process(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    inputs: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const values = (inputs.input_list ?? this.input_list ?? []) as unknown[];
    const list = Array.isArray(values) ? values : [values];

    for (const [index, item] of list.entries()) {
      yield { output: item, index };
    }
  }
}

export class CollectNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Collect";
            static readonly title = "Collect";
            static readonly description = "Collect items until the end of the stream and return them as a list.\n    collector, aggregate, list, stream\n\n    Use cases:\n    - Gather results from multiple processing steps\n    - Collect streaming data into batches\n    - Aggregate outputs from parallel operations";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  static readonly syncMode = "on_any" as const;

  private _items: unknown[] = [];
  @prop({ type: "any", default: [], title: "Input Item", description: "The input item to collect." })
  declare input_item: any;




  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("input_item" in inputs) {
      this._items.push(inputs.input_item);
    }
    return { output: [...this._items] };
  }
}

export class RerouteNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Reroute";
            static readonly title = "Reroute";
            static readonly description = "Pass data through unchanged for tidier workflow layouts.\n    reroute, passthrough, organize, tidy, flow, connection, redirect\n\n    Use cases:\n    - Organize complex workflows by routing connections\n    - Create cleaner visual layouts\n    - Redirect data flow without modification";
        static readonly metadataOutputTypes = {
    output: "any"
  };
  
            static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;
  @prop({ type: "any", default: [], title: "Input Value", description: "Value to pass through unchanged" })
  declare input_value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: inputs.input_value ?? this.input_value ?? null };
  }
}

export const CONTROL_NODES = [
  IfNode,
  ForEachNode,
  CollectNode,
  RerouteNode,
] as const;
