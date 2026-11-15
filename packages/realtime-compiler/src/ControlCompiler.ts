import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { PLAN_SCHEMA } from "./generated/PlanSchema.js";
import { compareNames, fail, hash, identity, integer, literalValues, stateKey, values } from "./CompilerSupport.js";
import type { AnalyticOperation, CompileInput, ControlDescriptor, ControlExpression, ControlInstruction, ExpressionBinding, LiveDescriptor, ShaderDescriptor, ValueBinding } from "./Types.js";

const ARITIES: ReadonlyMap<string, number> = new Map([
  ["time.seconds", 0], ["time.beats", 0], ["time.dt", 0], ["time.frame", 0], ["output.width", 0], ["output.height", 0],
  ["add", 2], ["subtract", 2], ["multiply", 2], ["divide", 2], ["min", 2], ["max", 2], ["less", 2], ["equal", 2],
  ["remap", 5], ["vec2", 2], ["vec3", 3], ["vec4", 4], ["pow", 2], ["tanh", 1],
  ["damp", 2], ["envelope", 3], ["oscillator", 1], ["sample_hold", 1], ["integrator", 1], ["counter", 2]
]);
const STATEFUL = new Set(["damp", "envelope", "oscillator", "sample_hold", "integrator", "counter"]);
function operationWidth(op: string, args: readonly { width: number }[], node: string): number {
  if (ARITIES.get(op) !== args.length) { fail(node, "control_arity", op); }
  const width = Math.max(1, ...args.map((arg) => arg.width));
  if (args.some((arg) => arg.width !== 1 && arg.width !== width)) { fail(node, "control_width", "Incompatible vector widths"); }
  if (op === "vec2" || op === "vec3" || op === "vec4") {
    if (width !== 1) { fail(node, "control_width", "Vector packing requires scalars"); }
    return args.length;
  }
  if (["oscillator", "sample_hold", "counter"].includes(op) && width !== 1) { fail(node, "control_width", "Operation requires scalars"); }
  return width;
}

// RT-D3: only fold operations whose double arithmetic matches the executor.
// Project transcendental math and tick-context sources remain native instructions.
function fold(op: AnalyticOperation, args: readonly number[][], width: number): number[] | undefined {
  const result: number[] = [];
  for (let lane = 0; lane < width; lane++) {
    const input = (port: number) => args[port][args[port].length === 1 ? 0 : lane];
    let value: number;
    switch (op) {
      case "add": value = input(0) + input(1); break;
      case "subtract": value = input(0) - input(1); break;
      case "multiply": value = input(0) * input(1); break;
      case "divide": value = input(1) === 0 ? 0 : input(0) / input(1); break;
      case "min": value = input(1) < input(0) ? input(1) : input(0); break;
      case "max": value = input(0) < input(1) ? input(1) : input(0); break;
      case "less": value = Number(input(0) < input(1)); break;
      case "equal": value = Number(input(0) === input(1)); break;
      case "remap": {
        const range = input(2) - input(1);
        value = range === 0 ? input(3) : input(3) + (input(0) - input(1)) / range * (input(4) - input(3));
        break;
      }
      case "vec2": case "vec3": case "vec4": value = args[lane][0]; break;
      default: return undefined;
    }
    if (!Number.isFinite(value)) { return undefined; }
    result.push(value);
  }
  return result;
}

export function createControlCompiler(domain: "audio" | "render", input: CompileInput,
  nodes: ReadonlyMap<string, NodeDescriptor>, incoming: ReadonlyMap<string, ReadonlyMap<string, Edge>>) {
  const { session } = input;
  const ops: ControlInstruction[] = []; const stateful: Array<ControlInstruction & { stateVersion: number }> = [];
  const registers = new Map<string, { index: number; width: number }>(); let registerCount = 0;
  const registerHashes = new Map<number, string>();
  function synthetic(kind: string, node: string, field: string): string {
    const id = `@${kind}:${encodeURIComponent(node)}:${encodeURIComponent(field)}`;
    if (nodes.has(id)) { fail(node, "identity_collision", id); }
    return id;
  }
  // RT-F48: logical dependencies keep allocation changes out of an audio path's identity.
  function instructionHash(instruction: ControlInstruction): void {
    const dimensions = instruction.op === "output.width" ? session.width : instruction.op === "output.height" ? session.height : null;
    registerHashes.set(instruction.out, hash(["control-path-v1", instruction.domain, instruction.node, instruction.op,
      "stateVersion" in instruction ? instruction.stateVersion : null, session.sampleRate, session.quantum, session.seed, dimensions,
      instruction.in.map((index) => registerHashes.get(index)), instruction.values]));
  }
  const expressionOrders = new Map<ControlExpression, readonly ControlExpression[]>();
  function expressionOrder(root: ControlExpression, node: string): readonly ControlExpression[] {
    const cached = expressionOrders.get(root);
    if (cached) { return cached; }
    const ordered: ControlExpression[] = [];
    const active = new Set<ControlExpression>(); const done = new Set<ControlExpression>();
    const stack = [{ expression: root, finish: false }];
    let visits = 0;
    while (stack.length) {
      const current = stack.pop(); if (!current) { continue; }
      const { expression, finish } = current;
      if (done.has(expression)) { continue; }
      if (finish) { active.delete(expression); done.add(expression); ordered.push(expression); continue; }
      if (active.has(expression)) { fail(node, "expression_cycle", "Uniform expression contains a cycle"); }
      if (++visits > 10000) { fail(node, "expression_limit", "Uniform expression exceeds compiler limits"); }
      active.add(expression); stack.push({ expression, finish: true });
      if (expression.kind === "operation") {
        if (ARITIES.get(expression.op) !== expression.inputs.length) { fail(node, "control_arity", expression.op); }
        for (let index = expression.inputs.length - 1; index >= 0; index--) {
          stack.push({ expression: expression.inputs[index], finish: false });
        }
      }
    }
    expressionOrders.set(root, ordered); return ordered;
  }
  function shaderInputs(descriptor: Extract<LiveDescriptor, { kind: "shader" }>, node: string): string[] {
    const fields = new Set<string>(); const properties = new Set<string>();
    for (const uniform of descriptor.uniforms) {
      const field = "expression" in uniform ? uniform.field : uniform.property;
      if (!field || fields.has(field)) { fail(node, "descriptor", "Uniform fields must be nonempty and unique"); }
      fields.add(field);
      if ("expression" in uniform) {
        for (const expression of expressionOrder(uniform.expression, node)) {
          if (expression.kind === "property") { properties.add(expression.property); }
        }
      } else { properties.add(uniform.property); }
    }
    return [...Object.keys(descriptor.textureInputs), ...properties];
  }
  function binding(node: NodeDescriptor, field: ValueBinding): { index: number; width: number } {
    const edge = incoming.get(node.id)?.get(field.property);
    if (edge) {
      if (edge.edge_type === "control") { fail(node.id, "unsupported", "Workflow execution-control edges are not control values"); }
      const result = registers.get(identity(edge.source, edge.sourceHandle));
      if (!result) { fail(node.id, "kind", `${field.property} requires a live control value`); }
      return result;
    }
    const literal = values(node, field); const result = { index: registerCount++, width: literal.length };
    ops.push({ node: synthetic("uniform", node.id, field.property), op: "constant", domain, out: result.index, in: [], values: literal });
    instructionHash(ops[ops.length - 1]);
    return result;
  }
  function expressionBinding(node: NodeDescriptor, field: ExpressionBinding): { index: number; width: number } {
    type Value = { kind: "literal"; values: number[]; width: number } | { kind: "register"; index: number; width: number };
    const lowered = new Map<ControlExpression, Value>();
    const order = expressionOrder(field.expression, node.id);
    function materialize(expression: ControlExpression, value: Value, index: number): { index: number; width: number } {
      if (value.kind === "register") { return value; }
      const result = { kind: "register" as const, index: registerCount++, width: value.width };
      const name = expression === field.expression ? synthetic("uniform", node.id, field.field) : synthetic("expression", node.id, JSON.stringify([field.field, index]));
      ops.push({ node: name, op: "constant", domain, out: result.index, in: [], values: value.values });
      instructionHash(ops[ops.length - 1]);
      lowered.set(expression, result); return result;
    }
    const positions = new Map(order.map((expression, index) => [expression, index]));
    for (let index = 0; index < order.length; index++) {
      const expression = order[index];
      if (expression.kind === "property" && incoming.get(node.id)?.has(expression.property)) {
        lowered.set(expression, { kind: "register", ...binding(node, expression) });
      } else if (expression.kind !== "operation") {
        const literal = expression.kind === "property" ? values(node, expression) : literalValues(expression.value, node.id, field.field);
        lowered.set(expression, { kind: "literal", values: literal, width: literal.length });
      } else {
        const args = expression.inputs.map((argument) => {
          const result = lowered.get(argument); if (!result) { return fail(node.id, "expression", "Missing expression input"); } return result;
        });
        const width = operationWidth(expression.op, args, node.id);
        const literals = args.flatMap((arg) => arg.kind === "literal" ? [arg.values] : []);
        const folded = literals.length === args.length ? fold(expression.op, literals, width) : undefined;
        if (folded) { lowered.set(expression, { kind: "literal", values: folded, width }); continue; }
        const inputs = expression.inputs.map((argument) => {
          const value = lowered.get(argument); const position = positions.get(argument);
          if (!value || position === undefined) { return fail(node.id, "expression", "Missing expression input"); }
          return materialize(argument, value, position).index;
        });
        const out = registerCount++;
        ops.push({ node: synthetic("expression", node.id, JSON.stringify([field.field, index])), op: expression.op, domain, out, in: inputs, values: [] });
        instructionHash(ops[ops.length - 1]);
        lowered.set(expression, { kind: "register", index: out, width });
      }
    }
    const result = lowered.get(field.expression);
    if (!result) { return fail(node.id, "expression", "Missing uniform expression"); }
    return materialize(field.expression, result, order.length - 1);
  }
  function lower(node: NodeDescriptor, descriptor: ControlDescriptor): void {
    const id = node.id;
    if (STATEFUL.has(descriptor.op) !== ("stateVersion" in descriptor)) { fail(id, "state_version", "State version must match the operation class"); }
    let args: { index: number; width: number }[] = []; let literal: number[] = []; let width: number;
    if (descriptor.op === "constant") { literal = values(node, descriptor.value); width = literal.length; }
    else {
      if (ARITIES.get(descriptor.op) !== descriptor.inputs.length) { fail(id, "control_arity", descriptor.op); }
      args = descriptor.inputs.map((field) => binding(node, field));
      width = operationWidth(descriptor.op, args, id);
    }
    const output = registerCount++;
    const instruction: ControlInstruction = { node: id, op: descriptor.op, domain, out: output, in: args.map((arg) => arg.index), values: literal };
    if ("stateVersion" in descriptor) {
      integer(descriptor.stateVersion, 1, 4294967295, id);
      if (descriptor.stateVersion !== 1) { fail(id, "state_version", "Unsupported built-in control state version"); }
      const operation = { ...instruction, stateVersion: descriptor.stateVersion }; stateful.push(operation); instructionHash(operation);
    } else { ops.push(instruction); instructionHash(instruction); }
    registers.set(identity(id, descriptor.output), { index: output, width });
  }
  function inputPorts(descriptor: ControlDescriptor | ShaderDescriptor, node: string): string[] {
    if (descriptor.kind === "control" && !descriptor.output) { fail(node, "descriptor", "Control output must be nonempty"); }
    const ports = descriptor.kind === "shader" ? shaderInputs(descriptor, node) : descriptor.op === "constant" ? [] : descriptor.inputs.map((field) => field.property);
    if (ports.some((port) => !port) || new Set(ports).size !== ports.length) { fail(node, "descriptor", "Descriptor input names overlap or are empty"); }
    return ports;
  }
  function lowerRegion(seeds: readonly string[]): void {
    const region = new Map<string, ControlDescriptor>(); const pending = [...seeds];
    while (pending.length) {
      const id = pending.pop(); if (id === undefined || region.has(id)) { continue; }
      const node = nodes.get(id); const descriptor = node && input.descriptors.get(node.type);
      if (!node || descriptor?.kind !== "control") { fail(id, "kind", "Audio parameters require live control producers"); }
      const allowed = new Set(inputPorts(descriptor, id));
      for (const [port, edge] of incoming.get(id) ?? []) {
        if (!allowed.has(port)) { fail(id, "port", port); }
        if (edge.edge_type === "control") { fail(id, "unsupported", "Workflow execution-control edges are not control values"); }
        pending.push(edge.source);
      }
      region.set(id, descriptor);
    }
    const degree = new Map<string, number>(); const consumers = new Map<string, string[]>();
    for (const id of [...region.keys()].sort(compareNames)) { degree.set(id, 0); consumers.set(id, []); }
    for (const id of degree.keys()) {
      for (const edge of incoming.get(id)?.values() ?? []) {
        degree.set(id, (degree.get(id) ?? 0) + 1); consumers.get(edge.source)?.push(id);
      }
    }
    const queue = [...degree.keys()].filter((id) => degree.get(id) === 0); let count = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const id = queue[cursor]; const node = nodes.get(id); const descriptor = region.get(id);
      if (!node || !descriptor) { fail(id, "descriptor", id); }
      lower(node, descriptor); count++;
      for (const target of consumers.get(id) ?? []) {
        const remaining = (degree.get(target) ?? 0) - 1; degree.set(target, remaining);
        if (remaining === 0) { queue.push(target); }
      }
    }
    if (count !== region.size) { fail([...degree.keys()].find((id) => (degree.get(id) ?? 0) > 0) ?? "$control", "cycle", "Control graph contains a cycle"); }
  }
  return {
    inputPorts, lower, lowerRegion, bind: binding,
    uniform(node: NodeDescriptor, field: ValueBinding | ExpressionBinding) { return "expression" in field ? expressionBinding(node, field) : binding(node, field); },
    hash(index: number): string {
      const result = registerHashes.get(index); if (!result) { return fail("$control", "register", "Missing logical control producer"); } return result;
    },
    program() {
      if (registerCount > PLAN_SCHEMA.properties.control.properties.registers.maximum) { fail("$control", "limit", "Too many control registers"); }
      return { registers: registerCount, ops, stateful };
    },
    stateKeys() { return stateful.map((op) => ({ node: op.node, kind: "control" as const, key: stateKey(op.node, op.op, op.stateVersion, session) })); }
  };
}
