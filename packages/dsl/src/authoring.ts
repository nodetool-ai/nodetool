import {
  createNode,
  resolveConnection,
  connectionIdentity,
  connectionSlot,
  workflow as graphWorkflow,
  withBuildScope,
  withNodeScope,
  type Connectable,
  type OutputHandle,
  type SingleOutputNode,
  type NodeOptions,
  type Workflow,
  type WorkflowTerminal
} from "./core.js";
import type { ImageRef, AudioRef, VideoRef } from "./types.js";

/** Workflow parameter type with an optional explicit fallback. */
export interface InputType<T, Optional extends boolean = boolean> {
  readonly type: string;
  readonly optionalInput: Optional;
  readonly fallback?: T;
  readonly __type?: T;
  optional(): InputType<T | null, true>;
  optional(value: T): InputType<T, true>;
}

function inputType<T, Optional extends boolean = false>(
  type: string,
  optionalInput = false as Optional,
  fallback?: T
): InputType<T, Optional> {
  return Object.freeze({
    type,
    optionalInput,
    fallback,
    optional(value?: T) {
      return inputType<T | null, true>(
        type,
        true,
        value === undefined ? null : value
      );
    }
  }) as InputType<T, Optional>;
}

/** Descriptors for symbolic workflow inputs. Optional values default to null. */
export const t = Object.freeze({
  string: () => inputType<string>("str"),
  int: () => inputType<number>("int"),
  float: () => inputType<number>("float"),
  boolean: () => inputType<boolean>("bool"),
  image: () => inputType<ImageRef>("image"),
  audio: () => inputType<AudioRef>("audio"),
  video: () => inputType<VideoRef>("video"),
  value: <T = unknown>() => inputType<T>("any"),
  list: <T>(item: InputType<T>) => inputType<T[]>(`list[${item.type}]`)
});

export type InputSchema = Record<string, InputType<unknown>>;
type InputValue<S> = S extends InputType<infer T> ? T : never;
export type WorkflowParams<I extends InputSchema> = {
  [K in keyof I as I[K] extends InputType<unknown, true>
    ? never
    : K]: InputValue<I[K]>;
} & {
  [K in keyof I as I[K] extends InputType<unknown, true>
    ? K
    : never]?: InputValue<I[K]>;
};
export type SymbolicInputs<I extends InputSchema> = {
  readonly [K in keyof I]: OutputHandle<InputValue<I[K]>>;
};
export type WorkflowValues<O extends Record<string, unknown>> = {
  [K in keyof O]: O[K] extends OutputHandle<infer V>
    ? V
    : O[K] extends SingleOutputNode<infer V>
      ? V
      : O[K];
};
export type WorkflowBuilder<
  I extends InputSchema,
  O extends Record<string, unknown>
> = (inputs: SymbolicInputs<I>) => O;
export type WorkflowDefinition<
  I extends InputSchema,
  O extends Record<string, unknown>
> = Workflow & {
  (
    params: {
      [K in keyof WorkflowParams<I>]: Connectable<WorkflowParams<I>[K]>;
    },
    options?: NodeOptions
  ): O;
  readonly inputSchema: I;
  readonly outputNames: readonly string[];
  toJSON(): Workflow;
};

/** Build a legacy graph or a callable graph with a typed parameter schema. */
export function workflow<
  I extends InputSchema,
  O extends Record<string, unknown>
>(schema: I, builder: WorkflowBuilder<I, O>): WorkflowDefinition<I, O>;
export function workflow(...terminals: WorkflowTerminal[]): Workflow;
export function workflow(...args: unknown[]): Workflow {
  if (args.length === 2 && typeof args[1] === "function") {
    return defineWorkflow(
      args[0] as InputSchema,
      args[1] as WorkflowBuilder<InputSchema, Record<string, unknown>>
    );
  }
  return graphWorkflow(...(args as WorkflowTerminal[]));
}

const INPUT_NODES = {
  str: "StringInput",
  int: "IntegerInput",
  float: "FloatInput",
  bool: "BooleanInput",
  image: "ImageInput",
  audio: "AudioInput",
  video: "VideoInput"
} satisfies Record<string, string>;

type InputProperties = { name: string; value?: unknown };

function input<T>(name: string, descriptor: InputType<T>) {
  const specialized =
    !descriptor.optionalInput && descriptor.type in INPUT_NODES
      ? INPUT_NODES[descriptor.type as keyof typeof INPUT_NODES]
      : undefined;
  const properties: InputProperties = { name };
  if (descriptor.optionalInput) {
    properties.value = descriptor.fallback;
  }
  return createNode<{ output: T }, "output">(
    `nodetool.input.${specialized || "ValueInput"}`,
    properties,
    {
      id: `input/${name}`,
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: descriptor.type }
    }
  );
}

/** Runtime port type used when lowering typed helpers to existing graph nodes. */
export function valueType(value: unknown): string {
  const handle = resolveConnection(value);
  if (handle) return handle.valueType ?? "any";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float";
  if (Array.isArray(value))
    return `list[${value.length ? valueType(value[0]) : "any"}]`;
  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string"
  ) {
    if (["image", "audio", "video", "model3d"].includes(value.type))
      return value.type;
  }
  return "any";
}

function resultNodes(result: Record<string, unknown>): WorkflowTerminal[] {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof result.then === "function"
  ) {
    throw new Error(
      "A workflow builder must synchronously return a named output object"
    );
  }
  if (!Object.keys(result).length)
    throw new Error("A workflow must return at least one named output");
  return Object.entries(result).map(([name, value]) =>
    createNode(
      "nodetool.output.Output",
      { name, value },
      { id: `output/${name}`, outputNames: ["output"] }
    )
  );
}

/** @internal Build a callable workflow using the ordinary graph representation. */
export function defineWorkflow<
  I extends InputSchema,
  O extends Record<string, unknown>
>(schema: I, builder: WorkflowBuilder<I, O>): WorkflowDefinition<I, O> {
  schema = Object.freeze({ ...schema }) as I;
  for (const [name, descriptor] of Object.entries(schema)) {
    if (
      !name ||
      !descriptor ||
      typeof descriptor.type !== "string" ||
      typeof descriptor.optionalInput !== "boolean"
    ) {
      throw new Error(`Invalid workflow input descriptor: ${name}`);
    }
  }
  let outputNames: string[] = [];
  const graph = withBuildScope(() => {
    const inputs = Object.fromEntries(
      Object.entries(schema).map(([name, descriptor]) => [
        name,
        input(name, descriptor)
      ])
    );
    const symbols = Object.fromEntries(
      Object.entries(inputs).map(([name, node]) => [name, node.output()])
    );
    const result = builder(symbols as SymbolicInputs<I>);
    const outputs = resultNodes(result);
    outputNames = Object.keys(result);
    return graphWorkflow(...outputs, ...Object.values(inputs));
  });
  const definition = (
    params: Record<string, unknown>,
    options?: NodeOptions
  ): O =>
    withNodeScope(options?.id, () => {
      for (const [name, descriptor] of Object.entries(schema)) {
        if (
          (!Object.hasOwn(params, name) || params[name] === undefined) &&
          !descriptor.optionalInput
        )
          throw new Error(`Missing required workflow input "${name}"`);
      }
      for (const name of Object.keys(params)) {
        if (!Object.hasOwn(schema, name))
          throw new Error(`Unknown workflow input "${name}"`);
      }
      const inputs = Object.fromEntries(
        Object.entries(schema).map(([name, descriptor]) => [
          name,
          createNode<{ output: unknown }, "output">(
            "nodetool.control.Reroute",
            {
              input_value:
                Object.hasOwn(params, name) && params[name] !== undefined
                  ? params[name]
                  : descriptor.fallback
            },
            {
              id: `input/${name}`,
              outputNames: ["output"],
              defaultOutput: "output",
              outputTypes: { output: descriptor.type },
              outputCorrelation: {
                output: { kind: "forward", source: "input_value" }
              }
            }
          ).output()
        ])
      );
      const result = builder(inputs as SymbolicInputs<I>);
      if (
        !result ||
        Object.keys(result).join("\0") !== outputNames.join("\0")
      ) {
        throw new Error(
          "A composed workflow must preserve its declared output names"
        );
      }
      return result;
    });
  return Object.freeze(
    Object.assign(definition, graph, {
      inputSchema: schema,
      outputNames: Object.freeze(outputNames),
      toJSON: () => graph
    })
  ) as WorkflowDefinition<I, O>;
}

/** Convert the host graph envelope to the existing kernel envelope. */
export interface KernelWorkflow {
  nodes: Array<Record<string, unknown>>;
  edges: Workflow["edges"];
}

export function toKernelGraph(graph: Workflow): KernelWorkflow {
  return {
    nodes: graph.nodes.map((node) => {
      if (!("data" in node)) {
        return Object.fromEntries(Object.entries(node));
      }
      const { data, streaming, streamingInput, ...rest } = node;
      return {
        ...rest,
        properties: data,
        is_streaming_output: streaming,
        is_streaming_input: streamingInput
      };
    }),
    edges: graph.edges.map((edge) => ({ ...edge }))
  };
}

interface BodyInputs extends Record<string, unknown> {}

interface Body {
  graph: ReturnType<typeof toKernelGraph>;
  captures: Record<string, OutputHandle<unknown>>;
  type: string;
}

function bodyGraph<T>(build: () => T): Body {
  const captures: Record<string, OutputHandle<unknown>> = {};
  const captured = new Map<object, Map<string, OutputHandle<unknown>>>();
  let type = "any";
  let captureCount = 0;
  const graph = withBuildScope(
    () => {
      const value = build();
      if (
        value &&
        typeof value === "object" &&
        "then" in value &&
        typeof value.then === "function"
      ) {
        throw new Error("Branch and map callbacks must return synchronously");
      }
      type = valueType(value);
      return graphWorkflow(...resultNodes({ value }));
    },
    (handle) => {
      const identity = connectionIdentity(handle);
      const slot = connectionSlot(handle);
      let slots = captured.get(identity);
      if (!slots) {
        slots = new Map();
        captured.set(identity, slots);
      }
      let local = slots.get(slot);
      if (!local) {
        const name = `capture_${captureCount++}`;
        captures[name] = handle;
        local = input(name, inputType(handle.valueType ?? "any")).output();
        slots.set(slot, local);
      }
      return local;
    }
  );
  return { graph: toKernelGraph(graph), captures, type };
}

function route(
  condition: Connectable<boolean>,
  value: unknown,
  type: string,
  source?: string
) {
  return createNode<{ if_true: unknown; if_false: unknown }>(
    "nodetool.control.If",
    { condition, value },
    {
      outputNames: ["if_true", "if_false"],
      outputTypes: { if_true: type, if_false: type },
      outputCorrelation: source
        ? {
            if_true: { kind: "forward", source },
            if_false: { kind: "forward", source }
          }
        : undefined
    }
  );
}

function subgraph(
  body: Body,
  inputs: Record<string, unknown>,
  correlationSource: string
) {
  return createNode<{ value: unknown }, "value">(
    "nodetool.workflows.subgraph.Subgraph",
    { graph: body.graph, ...inputs },
    {
      outputNames: ["value"],
      defaultOutput: "value",
      outputTypes: { value: body.type },
      dynamicOutputs: { value: { type: body.type, type_args: [] } },
      outputCorrelation: {
        value: { kind: "forward", source: correlationSource }
      }
    }
  );
}

/** Build two isolated bodies and execute only the runtime-selected branch. */
export function choose<T>(
  condition: Connectable<boolean>,
  branches: { then: () => Connectable<T>; else: () => Connectable<NoInfer<T>> }
): OutputHandle<T> {
  const yes = bodyGraph(branches.then);
  const no = bodyGraph(branches.else);
  if (
    yes.type !== "any" &&
    no.type !== "any" &&
    yes.type !== no.type &&
    ![yes.type, no.type].every((type) => ["int", "float"].includes(type))
  ) {
    throw new Error(
      `Branch output types do not match: ${yes.type} and ${no.type}`
    );
  }
  const gate = route(condition, true, "bool");
  const branch = (body: Body, slot: "if_true" | "if_false") => {
    const inputs: BodyInputs = { gate: gate.output(slot) };
    for (const [name, handle] of Object.entries(body.captures)) {
      inputs[name] = route(condition, handle, handle.valueType ?? "any").output(
        slot
      );
    }
    return subgraph(body, inputs, "gate");
  };
  const a = branch(yes, "if_true");
  const b = branch(no, "if_false");
  return createNode<{ output: T }, "output">(
    "nodetool.code.Code",
    {
      code: 'for await (const value of stream("yes")) { await emit("output", value); }\nfor await (const value of stream("no")) { await emit("output", value); }',
      yes: a,
      no: b
    },
    {
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: yes.type },
      streamingInput: true,
      streaming: true
    }
  ).output();
}

/** Map through the kernel's iteration and collection primitives. */
export function map<T, U>(
  items: Connectable<T[]>,
  build: (item: OutputHandle<T>, index: OutputHandle<number>) => Connectable<U>
): OutputHandle<U[]> {
  const listType = valueType(items);
  const itemType = listType.startsWith("list[") ? listType.slice(5, -1) : "any";
  const body = bodyGraph(() =>
    build(
      input("item", inputType<T>(itemType)).output(),
      input("index", t.int()).output()
    )
  );
  const each = createNode<{ output: T; index: number }>(
    "nodetool.control.ForEach",
    { input_list: items },
    {
      outputNames: ["output", "index"],
      outputTypes: { output: itemType, index: "int" },
      streaming: true,
      outputCorrelation: {
        output: { kind: "iteration", source: "__execution__", group: "items" },
        index: { kind: "iteration", source: "__execution__", group: "items" }
      }
    }
  );
  const inputs: BodyInputs = {
    item: each.output("output"),
    index: each.output("index")
  };
  if (Object.keys(body.captures).length) {
    const gate = createNode<{ output: boolean }, "output">(
      "nodetool.code.Code",
      {
        code: 'await output("output", true);',
        item: each.output("output")
      },
      {
        outputNames: ["output"],
        defaultOutput: "output",
        outputTypes: { output: "bool" },
        outputCorrelation: { output: { kind: "forward", source: "item" } }
      }
    );
    for (const [name, handle] of Object.entries(body.captures)) {
      inputs[name] = route(
        gate,
        handle,
        handle.valueType ?? "any",
        "condition"
      ).output("if_true");
    }
  }
  const invocation = subgraph(body, inputs, "item");
  return createNode<{ output: U[] }, "output">(
    "nodetool.control.Collect",
    { input_item: invocation },
    {
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: `list[${body.type}]` },
      streamingInput: true,
      inputMode: "stream",
      outputCorrelation: {
        output: {
          kind: "aggregate",
          source: "input_item",
          collapse: "innermost"
        }
      }
    }
  ).output();
}

/** Interpolate symbolic values through the existing dynamic-input Template node. */
export function template(
  strings: TemplateStringsArray,
  ...values: unknown[]
): OutputHandle<string> {
  const inputs: Record<string, unknown> = {};
  let text = strings[0] ?? "";
  values.forEach((value, index) => {
    const name = `value_${index}`;
    inputs[name] = value;
    text += `{{${name}}}${strings[index + 1] ?? ""}`;
  });
  return createNode<{ output: string }, "output">(
    "nodetool.text.Template",
    { string: text, ...inputs },
    {
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: "str" }
    }
  ).output();
}
