// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import {
  createNode,
  resolveConnection,
  connectionIdentity,
  connectionSlot,
  workflow as graphWorkflow,
  withBuildScope,
  withNodeScope
} from "./core.js";
function inputType(type, optionalInput = false, fallback) {
  return Object.freeze({
    type,
    optionalInput,
    fallback,
    optional(value) {
      return inputType(
        type,
        true,
        value === void 0 ? null : value
      );
    }
  });
}
const t = Object.freeze({
  string: () => inputType("str"),
  int: () => inputType("int"),
  float: () => inputType("float"),
  boolean: () => inputType("bool"),
  image: () => inputType("image"),
  audio: () => inputType("audio"),
  video: () => inputType("video"),
  value: () => inputType("any"),
  list: (item) => inputType(`list[${item.type}]`)
});
function workflow(...args) {
  if (args.length === 2 && typeof args[1] === "function") {
    return defineWorkflow(
      args[0],
      args[1]
    );
  }
  return graphWorkflow(...args);
}
const INPUT_NODES = {
  str: "StringInput",
  int: "IntegerInput",
  float: "FloatInput",
  bool: "BooleanInput",
  image: "ImageInput",
  audio: "AudioInput",
  video: "VideoInput"
};
function input(name, descriptor) {
  const specialized = !descriptor.optionalInput && descriptor.type in INPUT_NODES ? INPUT_NODES[descriptor.type] : void 0;
  const properties = { name };
  if (descriptor.optionalInput) {
    properties.value = descriptor.fallback;
  }
  return createNode(
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
function valueType(value) {
  const handle = resolveConnection(value);
  if (handle) return handle.valueType ?? "any";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float";
  if (Array.isArray(value))
    return `list[${value.length ? valueType(value[0]) : "any"}]`;
  if (value && typeof value === "object" && "type" in value && typeof value.type === "string") {
    if (["image", "audio", "video", "model3d"].includes(value.type))
      return value.type;
  }
  return "any";
}
function resultNodes(result) {
  if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.then === "function") {
    throw new Error(
      "A workflow builder must synchronously return a named output object"
    );
  }
  if (!Object.keys(result).length)
    throw new Error("A workflow must return at least one named output");
  return Object.entries(result).map(
    ([name, value]) => createNode(
      "nodetool.output.Output",
      { name, value },
      { id: `output/${name}`, outputNames: ["output"] }
    )
  );
}
function defineWorkflow(schema, builder) {
  schema = Object.freeze({ ...schema });
  for (const [name, descriptor] of Object.entries(schema)) {
    if (!name || !descriptor || typeof descriptor.type !== "string" || typeof descriptor.optionalInput !== "boolean") {
      throw new Error(`Invalid workflow input descriptor: ${name}`);
    }
  }
  let outputNames = [];
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
    const result = builder(symbols);
    const outputs = resultNodes(result);
    outputNames = Object.keys(result);
    return graphWorkflow(...outputs, ...Object.values(inputs));
  });
  const definition = (params, options) => withNodeScope(options?.id, () => {
    for (const [name, descriptor] of Object.entries(schema)) {
      if ((!Object.hasOwn(params, name) || params[name] === void 0) && !descriptor.optionalInput)
        throw new Error(`Missing required workflow input "${name}"`);
    }
    for (const name of Object.keys(params)) {
      if (!Object.hasOwn(schema, name))
        throw new Error(`Unknown workflow input "${name}"`);
    }
    const inputs = Object.fromEntries(
      Object.entries(schema).map(([name, descriptor]) => [
        name,
        createNode(
          "nodetool.control.Reroute",
          {
            input_value: Object.hasOwn(params, name) && params[name] !== void 0 ? params[name] : descriptor.fallback
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
    const result = builder(inputs);
    if (!result || Object.keys(result).join("\0") !== outputNames.join("\0")) {
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
  );
}
function toKernelGraph(graph) {
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
function bodyGraph(build) {
  const captures = {};
  const captured = /* @__PURE__ */ new Map();
  let type = "any";
  let captureCount = 0;
  const graph = withBuildScope(
    () => {
      const value = build();
      if (value && typeof value === "object" && "then" in value && typeof value.then === "function") {
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
        slots = /* @__PURE__ */ new Map();
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
function route(condition, value, type, source) {
  return createNode(
    "nodetool.control.If",
    { condition, value },
    {
      outputNames: ["if_true", "if_false"],
      outputTypes: { if_true: type, if_false: type },
      outputCorrelation: source ? {
        if_true: { kind: "forward", source },
        if_false: { kind: "forward", source }
      } : void 0
    }
  );
}
function subgraph(body, inputs, correlationSource) {
  return createNode(
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
function choose(condition, branches) {
  const yes = bodyGraph(branches.then);
  const no = bodyGraph(branches.else);
  if (yes.type !== "any" && no.type !== "any" && yes.type !== no.type && ![yes.type, no.type].every((type) => ["int", "float"].includes(type))) {
    throw new Error(
      `Branch output types do not match: ${yes.type} and ${no.type}`
    );
  }
  const gate = route(condition, true, "bool");
  const branch = (body, slot) => {
    const inputs = { gate: gate.output(slot) };
    for (const [name, handle] of Object.entries(body.captures)) {
      inputs[name] = route(condition, handle, handle.valueType ?? "any").output(
        slot
      );
    }
    return subgraph(body, inputs, "gate");
  };
  const a = branch(yes, "if_true");
  const b = branch(no, "if_false");
  return createNode(
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
function map(items, build) {
  const listType = valueType(items);
  const itemType = listType.startsWith("list[") ? listType.slice(5, -1) : "any";
  const body = bodyGraph(
    () => build(
      input("item", inputType(itemType)).output(),
      input("index", t.int()).output()
    )
  );
  const each = createNode(
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
  const inputs = {
    item: each.output("output"),
    index: each.output("index")
  };
  if (Object.keys(body.captures).length) {
    const gate = createNode(
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
  return createNode(
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
function template(strings, ...values) {
  const inputs = {};
  let text = strings[0] ?? "";
  values.forEach((value, index) => {
    const name = `value_${index}`;
    inputs[name] = value;
    text += `{{${name}}}${strings[index + 1] ?? ""}`;
  });
  return createNode(
    "nodetool.text.Template",
    { string: text, ...inputs },
    {
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: "str" }
    }
  ).output();
}
export {
  choose,
  defineWorkflow,
  map,
  t,
  template,
  toKernelGraph,
  valueType,
  workflow
};
