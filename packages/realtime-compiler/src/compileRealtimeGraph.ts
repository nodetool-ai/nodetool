import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { PLAN_SCHEMA } from "./generated/PlanSchema.js";
import type { BatchBoundary, CompileInput, CompileResult, ControlInstruction, Diagnostic, LiveDescriptor, RenderPass, RenderPlan, TextureContract, ValueBinding } from "./Types.js";

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
  if (typeof value === "boolean") { return [Number(value)]; }
  if (typeof value === "number" && Number.isFinite(value)) { return [value]; }
  if (Array.isArray(value) && value.length >= 1 && value.length <= 4) {
    const lanes: number[] = [];
    for (const lane of value) {
      if (typeof lane !== "number" || !Number.isFinite(lane)) { fail(node.id, "control_value", binding.property); }
      lanes.push(lane);
    }
    return lanes;
  }
  return fail(node.id, "control_value", `Expected finite scalar or vector: ${binding.property}`);
}
function identity(source: string, output: string): string { return JSON.stringify([source, output]); }

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
  const pending = [sink.id];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined || live.has(id)) { continue; }
    const node = nodes.get(id);
    if (!node) { fail(id, "missing_node", id); }
    const descriptor = descriptors.get(node.type);
    if (!descriptor) { continue; }
    live.add(id);
    const allowed = descriptor.kind === "shader" ? [...Object.keys(descriptor.textureInputs), ...descriptor.uniforms.map((field) => field.property)] :
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
      let args: { index: number; width: number }[] = []; let literal: number[] = []; let width = 1;
      if (descriptor.op === "constant") { literal = values(node, descriptor.value); width = literal.length; }
      else {
        if (ARITIES.get(descriptor.op) !== descriptor.inputs.length) { fail(id, "control_arity", descriptor.op); }
        args = descriptor.inputs.map((field) => binding(node, field));
        width = Math.max(1, ...args.map((arg) => arg.width));
        if (args.some((arg) => arg.width !== 1 && arg.width !== width)) { fail(id, "control_width", "Incompatible vector widths"); }
        if (descriptor.op === "vec2" || descriptor.op === "vec3" || descriptor.op === "vec4") {
          if (width !== 1) { fail(id, "control_width", "Vector packing requires scalars"); } width = args.length;
        } else if (["oscillator", "sample_hold", "counter"].includes(descriptor.op) && width !== 1) { fail(id, "control_width", "Operation requires scalars"); }
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
        const source = texture(edge);
        if (source.contract.alpha !== contract.alpha) { fail(id, "alpha_conversion_required", port); }
        if (contract.format && source.contract.format !== contract.format) { fail(id, "format", port); }
        if (descriptor.retention === "retained" && !source.retained) { fail(id, "retention", "Retained input depends on a volatile output"); }
        if (source.contract.colorSpace !== contract.colorSpace) { warnings.push({ node: id, reason: "color_space", detail: port }); }
        inputs.set(port, source.id);
      }
      if (output.size.kind === "input" && !inputs.has(output.size.input)) { fail(id, "size", output.size.input); }
      passes.push({ node: id, module: descriptor.module, inputs: Object.fromEntries(inputs), uniforms: descriptor.uniforms.map((field) => binding(node, field).index), retention: descriptor.retention, output });
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
