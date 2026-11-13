import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { PLAN_SCHEMA } from "./generated/PlanSchema.js";
import type { AnalyticOperation, BatchBoundary, CompileInput, CompileResult, ControlExpression, ControlInstruction, Diagnostic, ExpressionBinding, LiveDescriptor, RenderPass, RenderPlan, TextureContract, ValueBinding } from "./Types.js";

const ARITIES: ReadonlyMap<string, number> = new Map([
  ["time.seconds", 0], ["time.beats", 0], ["time.dt", 0], ["time.frame", 0], ["output.width", 0], ["output.height", 0],
  ["add", 2], ["subtract", 2], ["multiply", 2], ["divide", 2], ["min", 2], ["max", 2], ["less", 2], ["equal", 2],
  ["remap", 5], ["vec2", 2], ["vec3", 3], ["vec4", 4], ["pow", 2], ["tanh", 1],
  ["damp", 2], ["envelope", 3], ["oscillator", 1], ["sample_hold", 1], ["integrator", 1], ["counter", 2]
]);
const STATEFUL = new Set(["damp", "envelope", "oscillator", "sample_hold", "integrator", "counter"]);
function compareNames(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
class CompileFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) { super(diagnostic.detail); }
}
function fail(node: string, reason: string, detail: string): never { throw new CompileFailure({ node, reason, detail }); }
function integer(value: number, min: number, max: number, node: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) { fail(node, "range", `Expected integer in [${min}, ${max}]`); }
}
function copyTexture(texture: TextureContract, node: string): TextureContract {
  if (!PLAN_SCHEMA.properties.render.properties.passes.items.properties.output.properties.format.enum.some((value) => value === texture.format) ||
      !PLAN_SCHEMA.properties.render.properties.present.properties.colorSpace.enum.some((value) => value === texture.colorSpace) ||
      (texture.alpha !== "straight" && texture.alpha !== "premultiplied")) { fail(node, "texture_contract", "Unsupported texture format, alpha or color space"); }
  if (texture.size.kind === "fixed") {
    integer(texture.size.width, 1, 16384, node); integer(texture.size.height, 1, 16384, node);
  } else if (texture.size.kind === "input") {
    if (!texture.size.input || !Number.isFinite(texture.size.scale) || texture.size.scale <= 0 || texture.size.scale > 16) { fail(node, "size", "Invalid input-relative size"); }
  } else if (texture.size.kind !== "session") { fail(node, "size", "Unsupported size rule"); }
  const size: TextureContract["size"] = texture.size.kind === "session" ? { kind: "session" } : texture.size.kind === "fixed"
    ? { kind: "fixed", width: texture.size.width, height: texture.size.height }
    : { kind: "input", input: texture.size.input, scale: texture.size.scale };
  return { format: texture.format, alpha: texture.alpha, colorSpace: texture.colorSpace, size };
}
function values(node: NodeDescriptor, binding: ValueBinding): number[] {
  const value: unknown = node.properties && Object.hasOwn(node.properties, binding.property) ? node.properties[binding.property] : binding.default;
  return literalValues(value, node.id, binding.property);
}
function literalValues(value: unknown, node: string, field: string): number[] {
  if (typeof value === "boolean") { return [Number(value)]; }
  if (typeof value === "number" && Number.isFinite(value)) { return [value]; }
  if (Array.isArray(value) && value.length >= 1 && value.length <= 4) {
    const lanes: number[] = [];
    for (const lane of value) {
      if (typeof lane !== "number" || !Number.isFinite(lane)) { fail(node, "control_value", field); }
      lanes.push(lane);
    }
    return lanes;
  }
  return fail(node, "control_value", `Expected finite scalar or vector: ${field}`);
}
function identity(source: string, output: string): string { return JSON.stringify([source, output]); }
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

/** Compile one render region without host I/O. Unsupported live forms reject with graph-node diagnostics. */
export function compileRealtimeGraph(input: CompileInput): CompileResult {
  try { return compile(input); }
  catch (error) {
    if (error instanceof CompileFailure) { return { status: "error", diagnostics: [error.diagnostic] }; }
    throw error;
  }
}
function compile(input: CompileInput): CompileResult {
  const { graph, descriptors, session } = input;
  integer(input.revision, 0, PLAN_SCHEMA.properties.revision.maximum, "$plan");
  integer(session.width, 1, 16384, "$session"); integer(session.height, 1, 16384, "$session");
  integer(session.seed, 0, 4294967295, "$session");
  if ((session.sampleRate !== 44100 && session.sampleRate !== 48000) || session.quantum !== 128 ||
      (session.channels !== "mono" && session.channels !== "stereo")) { fail("$session", "session", "Unsupported session layout"); }
  if (graph.nodes.length > 100000 || graph.edges.length > 100000) { fail("$graph", "limit", "Graph exceeds v1 compiler limits"); }
  if (input.outputs.length !== 1) { fail("$graph", "outputs", "This slice requires exactly one render output"); }
  const nodes = new Map<string, NodeDescriptor>();
  const incoming = new Map<string, Map<string, Edge>>();
  for (const node of graph.nodes) {
    if (!node.id || nodes.has(node.id)) { fail(node.id, "duplicate_node", "Node identity is empty or duplicated"); }
    nodes.set(node.id, node); incoming.set(node.id, new Map());
  }
  for (const edge of graph.edges) {
    if (!edge.sourceHandle || !edge.targetHandle) { fail(edge.target, "port", "Edge handles must be nonempty"); }
    const inputs = incoming.get(edge.target);
    if (!nodes.has(edge.source) || !inputs) { fail(edge.target, "missing_node", "Edge endpoint is missing"); }
    if (inputs.has(edge.targetHandle)) { fail(edge.target, "multiple_inputs", edge.targetHandle); }
    inputs.set(edge.targetHandle, edge);
  }
  const sink = nodes.get(input.outputs[0]);
  const sinkDescriptor = sink && descriptors.get(sink.type);
  if (!sink || sinkDescriptor?.kind !== "render-output") { fail(input.outputs[0], "outputs", "Expected a render-output descriptor"); }
  if (!PLAN_SCHEMA.properties.render.properties.present.properties.colorSpace.enum.some((value) => value === sinkDescriptor.colorSpace)) { fail(sink.id, "color_space", "Invalid presentation color space"); }
  const sinkEdge = incoming.get(sink.id)?.get(sinkDescriptor.input);
  if (!sinkEdge) { fail(sink.id, "missing_input", sinkDescriptor.input); }
  const live = new Set<string>();
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
  const pending = [sink.id];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined || live.has(id)) { continue; }
    const node = nodes.get(id);
    if (!node) { fail(id, "missing_node", id); }
    const descriptor = descriptors.get(node.type);
    if (!descriptor) { continue; }
    live.add(id);
    const allowed = descriptor.kind === "shader" ? shaderInputs(descriptor, id) :
      descriptor.kind === "render-output" ? [descriptor.input] : descriptor.op === "constant" ? [] : descriptor.inputs.map((field) => field.property);
    const names = new Set(allowed);
    if (names.size !== allowed.length) { fail(id, "descriptor", "Descriptor input names overlap"); }
    for (const [port, edge] of incoming.get(id) ?? []) {
      if (!names.has(port)) { fail(id, "port", port); }
      if (edge.edge_type === "control") { fail(id, "unsupported", "Workflow execution-control edges are not live values"); }
      pending.push(edge.source);
    }
  }
  const indegree = new Map<string, number>(); const consumers = new Map<string, string[]>();
  for (const id of [...live].sort()) { indegree.set(id, 0); consumers.set(id, []); }
  for (const id of indegree.keys()) {
    for (const edge of incoming.get(id)?.values() ?? []) {
      if (live.has(edge.source)) {
        indegree.set(id, (indegree.get(id) ?? 0) + 1); consumers.get(edge.source)?.push(id);
      }
    }
  }
  const queue = [...indegree.keys()].filter((id) => indegree.get(id) === 0); const ordered: string[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]; ordered.push(id);
    for (const target of consumers.get(id) ?? []) {
      const count = (indegree.get(target) ?? 0) - 1; indegree.set(target, count);
      if (count === 0) { queue.push(target); }
    }
  }
  if (ordered.length !== live.size) { fail([...indegree.keys()].find((id) => (indegree.get(id) ?? 0) > 0) ?? sink.id, "cycle", "Live graph contains a cycle; delay lowering is deferred"); }
  const ops: ControlInstruction[] = []; const stateful: Array<ControlInstruction & { stateVersion: number }> = [];
  const passes: RenderPass[] = []; const slots: Array<RenderPlan["slots"][number]> = [];
  const boundaries: BatchBoundary[] = []; const warnings: Diagnostic[] = [];
  const registers = new Map<string, { index: number; width: number }>(); let registerCount = 0;
  const textures = new Map<string, { id: string; contract: TextureContract; retained: boolean }>();
  const alphaConversions = new Map<string, { id: string; contract: TextureContract; retained: boolean }>();
  const batch = new Map<string, TextureContract>();
  for (const entry of input.batchTextures ?? []) {
    const key = identity(entry.node, entry.output);
    if (batch.has(key)) { fail(entry.node, "duplicate_slot", entry.output); }
    batch.set(key, entry.texture);
  }
  function synthetic(kind: string, node: string, field: string): string {
    const id = `@${kind}:${encodeURIComponent(node)}:${encodeURIComponent(field)}`;
    if (nodes.has(id)) { fail(node, "identity_collision", id); }
    return id;
  }
  function binding(node: NodeDescriptor, field: ValueBinding): { index: number; width: number } {
    const edge = incoming.get(node.id)?.get(field.property);
    if (edge) {
      const result = registers.get(identity(edge.source, edge.sourceHandle));
      if (!result) { fail(node.id, "kind", `${field.property} requires a live control value`); }
      return result;
    }
    const literal = values(node, field); const result = { index: registerCount++, width: literal.length };
    ops.push({ node: synthetic("uniform", node.id, field.property), op: "constant", domain: "render", out: result.index, in: [], values: literal });
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
      ops.push({ node: name, op: "constant", domain: "render", out: result.index, in: [], values: value.values });
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
        ops.push({ node: synthetic("expression", node.id, JSON.stringify([field.field, index])), op: expression.op, domain: "render", out, in: inputs, values: [] });
        lowered.set(expression, { kind: "register", index: out, width });
      }
    }
    const result = lowered.get(field.expression);
    if (!result) { return fail(node.id, "expression", "Missing uniform expression"); }
    return materialize(field.expression, result, order.length - 1);
  }
  function texture(edge: Edge): { id: string; contract: TextureContract; retained: boolean } {
    const key = identity(edge.source, edge.sourceHandle); const existing = textures.get(key);
    if (existing) { return existing; }
    const source = nodes.get(edge.source);
    if (!source || descriptors.has(source.type)) { return fail(edge.target, "kind", `No texture output ${key}`); }
    const contract = batch.get(key);
    if (!contract) { return fail(edge.source, "boundary_contract", `Supply the batch texture contract for ${edge.sourceHandle}`); }
    if (contract.size.kind === "input") { fail(edge.source, "boundary_contract", "Batch textures require session or fixed dimensions"); }
    const result = { id: synthetic("slot", edge.source, edge.sourceHandle), contract: copyTexture(contract, edge.source), retained: true };
    textures.set(key, result);
    slots.push({ id: result.id, kind: "texture", source: key, output: result.contract });
    boundaries.push({ node: edge.source, output: edge.sourceHandle, slot: result.id, reason: "no_live_descriptor" });
    return result;
  }
  function premultiply(edge: Edge, source: { id: string; contract: TextureContract; retained: boolean }) {
    const existing = alphaConversions.get(source.id);
    if (existing) { return existing; }
    // RT-D3: lower the catalog's straight ingress conversion explicitly into IR.
    const id = synthetic("alpha", edge.source, edge.sourceHandle);
    const contract: TextureContract = { ...source.contract, alpha: "premultiplied", size: { kind: "input", input: "source", scale: 1 } };
    passes.push({ node: id, module: "alpha.straightToPremul@1", inputs: { source: source.id }, uniforms: [], retention: source.retained ? "retained" : "volatile", output: contract });
    const result = { id, contract, retained: source.retained };
    alphaConversions.set(source.id, result); return result;
  }
  for (const id of ordered) {
    const node = nodes.get(id); if (!node) { fail(id, "missing_node", id); }
    const descriptor: LiveDescriptor | undefined = descriptors.get(node.type);
    if (!descriptor) { fail(id, "descriptor", node.type); }
    if (descriptor.kind === "render-output") {
      if (id !== sink.id) { fail(id, "outputs", "A render sink cannot feed another node"); }
      continue;
    }
    if (descriptor.kind === "control") {
      if (STATEFUL.has(descriptor.op) !== ("stateVersion" in descriptor)) { fail(id, "state_version", "State version must match the operation class"); }
      let args: { index: number; width: number }[] = []; let literal: number[] = []; let width: number;
      if (descriptor.op === "constant") { literal = values(node, descriptor.value); width = literal.length; }
      else {
        if (ARITIES.get(descriptor.op) !== descriptor.inputs.length) { fail(id, "control_arity", descriptor.op); }
        args = descriptor.inputs.map((field) => binding(node, field));
        width = operationWidth(descriptor.op, args, id);
      }
      const output = registerCount++;
      const instruction: ControlInstruction = { node: id, op: descriptor.op, domain: "render", out: output, in: args.map((arg) => arg.index), values: literal };
      if ("stateVersion" in descriptor) {
        integer(descriptor.stateVersion, 1, 4294967295, id); stateful.push({ ...instruction, stateVersion: descriptor.stateVersion });
      } else { ops.push(instruction); }
      registers.set(identity(id, descriptor.output), { index: output, width });
    } else {
      if (!descriptor.module || descriptor.texture.alpha !== "premultiplied" || !["retained", "volatile"].includes(descriptor.retention)) { fail(id, "descriptor", "Invalid shader descriptor"); }
      const output = copyTexture(descriptor.texture, id); const inputs = new Map<string, string>();
      for (const [port, contract] of Object.entries(descriptor.textureInputs).sort(([a], [b]) => compareNames(a, b))) {
        const edge = incoming.get(id)?.get(port);
        if (!edge) { if (contract.optional) { continue; } return fail(id, "missing_input", port); }
        let source = texture(edge);
        if (contract.format && source.contract.format !== contract.format) { fail(id, "format", port); }
        if (source.contract.alpha !== contract.alpha) {
          if (source.contract.alpha !== "straight" || contract.alpha !== "premultiplied" || source.contract.format !== "rgba8unorm") {
            fail(id, "alpha_conversion_required", port);
          }
          source = premultiply(edge, source);
        }
        if (descriptor.retention === "retained" && !source.retained) { fail(id, "retention", "Retained input depends on a volatile output"); }
        if (source.contract.colorSpace !== contract.colorSpace) { warnings.push({ node: id, reason: "color_space", detail: port }); }
        inputs.set(port, source.id);
      }
      if (output.size.kind === "input" && !inputs.has(output.size.input)) { fail(id, "size", output.size.input); }
      const uniforms = descriptor.uniforms.map((field) =>
        ("expression" in field ? expressionBinding(node, field) : binding(node, field)).index);
      passes.push({ node: id, module: descriptor.module, inputs: Object.fromEntries(inputs), uniforms, retention: descriptor.retention, output });
      textures.set(identity(id, descriptor.output), { id, contract: output, retained: descriptor.retention === "retained" });
    }
  }
  if (registerCount > PLAN_SCHEMA.properties.control.properties.registers.maximum) { fail("$control", "limit", "Too many control registers"); }
  const presented = texture(sinkEdge);
  const plan: RenderPlan = { schemaVersion: PLAN_SCHEMA.properties.schemaVersion.const, revision: input.revision,
    session: { sampleRate: session.sampleRate, quantum: session.quantum, channels: session.channels, width: session.width, height: session.height, seed: session.seed }, params: [],
    slots: slots.sort((a, b) => compareNames(a.id, b.id)), control: { registers: registerCount, ops, stateful },
    render: { passes, present: { source: presented.id, colorSpace: sinkDescriptor.colorSpace } }, audio: { buffers: [], nodes: [], sinks: [] } };
  return { status: "ok", plan, boundaries: boundaries.sort((a, b) => compareNames(a.slot, b.slot)), warnings };
}
