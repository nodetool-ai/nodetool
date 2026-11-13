import type { Edge } from "@nodetool-ai/protocol";
import { PLAN_SCHEMA } from "./generated/PlanSchema.js";
import { compareNames, CompileFailure, fail, identity, integer, parameterAllocator, prepareGraph } from "./CompilerSupport.js";
import { createControlCompiler } from "./ControlCompiler.js";
import { compileAudioGraph } from "./compileAudioGraph.js";
import type { BatchBoundary, CompileInput, CompileResult, Diagnostic, LiveDescriptor, RenderPass, RenderPlan, TextureContract } from "./Types.js";

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
/** Compile one audio or render region without host I/O. Unsupported forms reject with graph-node diagnostics. */
export function compileRealtimeGraph(input: CompileInput): CompileResult {
  try {
    const root = input.graph.nodes.find((node) => node.id === input.outputs[0]);
    return root && input.descriptors.get(root.type)?.kind === "audio-output" ? compileAudioGraph(input) : compile(input);
  }
  catch (error) {
    if (error instanceof CompileFailure) { return { status: "error", diagnostics: [error.diagnostic] }; }
    throw error;
  }
}
function compile(input: CompileInput): CompileResult {
  const { descriptors, session } = input;
  const { nodes, incoming } = prepareGraph(input);
  const allocation = parameterAllocator(input.allocation);
  const controls = createControlCompiler("render", input, nodes, incoming);
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
    if (descriptor.kind === "dsp" || descriptor.kind === "audio-output") { fail(id, "unsupported", "Mixed audio/render graphs are deferred"); }
    live.add(id);
    const allowed = descriptor.kind === "render-output" ? [descriptor.input] : controls.inputPorts(descriptor, id);
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
  const passes: RenderPass[] = []; const slots: Array<RenderPlan["slots"][number]> = [];
  const boundaries: BatchBoundary[] = []; const warnings: Diagnostic[] = [];
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
      controls.lower(node, descriptor);
    } else if (descriptor.kind === "shader") {
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
        controls.uniform(node, field).index);
      passes.push({ node: id, module: descriptor.module, inputs: Object.fromEntries(inputs), uniforms, retention: descriptor.retention, output });
      textures.set(identity(id, descriptor.output), { id, contract: output, retained: descriptor.retention === "retained" });
    } else { fail(id, "unsupported", "Mixed audio/render graphs are deferred"); }
  }
  const presented = texture(sinkEdge);
  const plan: RenderPlan = { schemaVersion: PLAN_SCHEMA.properties.schemaVersion.const, revision: input.revision,
    session: { sampleRate: session.sampleRate, quantum: session.quantum, channels: session.channels, width: session.width, height: session.height, seed: session.seed }, params: [],
    slots: slots.sort((a, b) => compareNames(a.id, b.id)), control: controls.program(),
    render: { passes, present: { source: presented.id, colorSpace: sinkDescriptor.colorSpace } }, audio: { buffers: [], nodes: [], sinks: [] } };
  const stateKeys = controls.stateKeys();
  return { status: "ok", plan, boundaries: boundaries.sort((a, b) => compareNames(a.slot, b.slot)), warnings, allocation: allocation.snapshot(), stateKeys };
}
