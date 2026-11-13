import type { Edge } from "@nodetool-ai/protocol";
import { compareNames, fail, hash, identity, integer, parameterAllocator, prepareGraph, stateKey, values } from "./CompilerSupport.js";
import { createControlCompiler } from "./ControlCompiler.js";
import type { AudioNode, BatchBoundary, BatchPcm, CompileInput, CompileResult, DspDescriptor, DspKernel, PlanParameter, RealtimePlan, StateKey } from "./Types.js";

// ABI 1 built-in contracts from native/realtime/audio.md. Product descriptors remain host supplied.
const KERNELS: ReadonlyMap<DspKernel, readonly [number, number]> = new Map([
  ["oscillator", [0, 2]], ["noise", [0, 1]], ["gain", [1, 1]], ["mix", [2, 2]], ["level-meter", [1, 0]], ["delay", [1, 2]], ["sample-player", [0, 1]],
  ["biquad.lowpass", [1, 3]], ["biquad.highpass", [1, 3]], ["biquad.bandpass", [1, 3]], ["biquad.notch", [1, 3]],
  ["biquad.allpass", [1, 3]], ["biquad.peaking", [1, 3]], ["biquad.lowshelf", [1, 3]], ["biquad.highshelf", [1, 3]]
]);

/** Audio-only DSP/control lowering with prepared PCM boundaries. Mixed domains and feedback reject. */
export function compileAudioGraph(input: CompileInput): CompileResult {
  const { nodes, incoming } = prepareGraph(input, true); const { descriptors, session } = input;
  const allocator = parameterAllocator(input.allocation);
  const controls = createControlCompiler("audio", input, nodes, incoming);
  const sinks = [...input.outputs].sort(compareNames).map((id) => {
    const node = nodes.get(id); const descriptor = node && descriptors.get(node.type);
    if (!node || descriptor?.kind !== "audio-output") { return fail(id, "outputs", "Expected audio-output descriptors; mixed-domain outputs are deferred"); }
    if (!["device", "tap", "record"].includes(descriptor.sink)) { fail(id, "descriptor", "Unsupported audio sink kind"); }
    const inputs = incoming.get(id); const edge = inputs?.get(descriptor.input);
    if (!edge || inputs?.size !== 1) { fail(id, "port", "Audio output requires its declared input only"); }
    return { node, descriptor, edge };
  });
  const live = new Map<string, DspDescriptor>(); const pending = sinks.map((sink) => sink.edge.source); const controlSeeds: string[] = [];
  const pcm = new Map<string, BatchPcm>(); const prepared = new Map<string, { id: string; contract: BatchPcm }>();
  const slots: Array<RealtimePlan["slots"][number]> = []; const boundaries: BatchBoundary[] = [];
  for (const entry of input.batchPcm ?? []) {
    const key = identity(entry.node, entry.output);
    if (pcm.has(key)) { fail(entry.node, "duplicate_slot", entry.output); }
    pcm.set(key, entry);
  }
  function resolvePcm(edge: Edge): { id: string; contract: BatchPcm } {
    const source = nodes.get(edge.source);
    if (!source || descriptors.has(source.type) || edge.edge_type === "control") { fail(edge.target, "kind", "PCM boundaries require a batch value producer"); }
    const key = identity(edge.source, edge.sourceHandle); const existing = prepared.get(key);
    if (existing) { return existing; }
    const contract = pcm.get(key);
    if (!contract) { return fail(edge.source, "boundary_contract", `Supply prepared PCM metadata for ${edge.sourceHandle}`); }
    if (contract.sampleRate !== session.sampleRate) { fail(edge.source, "sample_rate", "Prepared PCM requires the session sample rate"); }
    if (contract.channels !== session.channels) { fail(edge.source, "channels", "Prepared PCM requires the session channel layout"); }
    integer(contract.frames, 1, 4294967295, edge.source);
    if (!/^[0-9a-f]{64}$/.test(contract.contentHash)) { fail(edge.source, "boundary_contract", "Prepared PCM requires a full SHA-256 content hash"); }
    const id = `@slot:${encodeURIComponent(edge.source)}:${encodeURIComponent(edge.sourceHandle)}`;
    if (nodes.has(id)) { fail(edge.source, "identity_collision", id); }
    const result = { id, contract: { node: contract.node, output: contract.output, sampleRate: contract.sampleRate,
      channels: contract.channels, frames: contract.frames, contentHash: contract.contentHash } };
    prepared.set(key, result); slots.push({ id, kind: "buffer", source: key, channels: contract.channels });
    boundaries.push({ node: edge.source, output: edge.sourceHandle, slot: id, reason: "no_live_descriptor" });
    return result;
  }
  while (pending.length) {
    const id = pending.pop(); if (id === undefined || live.has(id)) { continue; }
    const node = nodes.get(id); const descriptor = node && descriptors.get(node.type);
    if (!node || descriptor?.kind !== "dsp") { fail(id, "unsupported", "Audio ports require DSP producers; batch PCM enters through sample-player"); }
    const contract = KERNELS.get(descriptor.kernel);
    if (!contract) { fail(id, "unknown_kernel", descriptor.kernel); }
    if (descriptor.inputs.length !== contract[0] || descriptor.params.length !== contract[1] || !descriptor.output) {
      fail(id, "descriptor", "Kernel port or parameter count differs from ABI 1");
    }
    integer(descriptor.stateVersion, 1, 4294967295, id);
    if (descriptor.stateVersion !== 1) { fail(id, "state_version", "Unsupported built-in DSP state version"); }
    if (descriptor.channels && descriptor.channels !== session.channels) { fail(id, "channels", "Kernel layout differs from session"); }
    const fields = [...descriptor.inputs, ...descriptor.params.map((param) => param.property), ...(descriptor.delayFrames ? [descriptor.delayFrames.property] : []),
      ...(descriptor.bufferInput !== undefined ? [descriptor.bufferInput] : [])];
    if (fields.some((field) => !field) || new Set(fields).size !== fields.length) { fail(id, "descriptor", "DSP input/property names must be nonempty and unique"); }
    if ((descriptor.kernel === "delay") !== (descriptor.delayFrames !== undefined)) { fail(id, "delay", "Only delay requires delayFrames"); }
    if ((descriptor.kernel === "sample-player") !== (descriptor.bufferInput !== undefined)) { fail(id, "buffer_slot", "Only sample-player requires a PCM input"); }
    const inputs = incoming.get(id);
    for (const [port, edge] of inputs ?? []) {
      if (descriptor.params.some((binding) => binding.property === port)) { controlSeeds.push(edge.source); }
      else if (port !== descriptor.bufferInput && !descriptor.inputs.includes(port)) { fail(id, "unsupported", "Unknown DSP port or connected structural property"); }
    }
    for (const port of descriptor.inputs) {
      const edge = inputs?.get(port); if (!edge) { fail(id, "missing_input", port); }
      pending.push(edge.source);
    }
    if (descriptor.bufferInput !== undefined) {
      const edge = inputs?.get(descriptor.bufferInput); if (!edge) { fail(id, "missing_input", descriptor.bufferInput); }
      resolvePcm(edge);
    }
    live.set(id, descriptor);
  }
  controls.lowerRegion(controlSeeds);
  const indegree = new Map<string, number>(); const consumers = new Map<string, string[]>();
  for (const id of [...live.keys()].sort(compareNames)) { indegree.set(id, 0); consumers.set(id, []); }
  for (const [id, descriptor] of live) {
    for (const port of descriptor.inputs) {
      const edge = incoming.get(id)?.get(port); if (!edge) { fail(id, "missing_input", port); }
      indegree.set(id, (indegree.get(id) ?? 0) + 1); consumers.get(edge.source)?.push(id);
    }
  }
  // Sort each adjacency list once so graph input permutations never change register/buffer order.
  for (const targets of consumers.values()) { targets.sort(compareNames); }
  const queue = [...indegree.keys()].filter((id) => indegree.get(id) === 0); const ordered: string[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]; ordered.push(id);
    for (const target of consumers.get(id) ?? []) {
      const remaining = (indegree.get(target) ?? 0) - 1; indegree.set(target, remaining);
      if (remaining === 0) { queue.push(target); }
    }
  }
  if (ordered.length !== live.size) { fail([...indegree.keys()].find((id) => (indegree.get(id) ?? 0) > 0) ?? "$audio", "cycle", "Audio feedback lowering is deferred"); }
  function producer(edge: { source: string; sourceHandle: string; target: string; edge_type?: string | null }): string {
    const descriptor = live.get(edge.source);
    if (edge.edge_type === "control") { fail(edge.target, "unsupported", "Workflow execution-control edges are not audio values"); }
    if (!descriptor || edge.sourceHandle !== descriptor.output) { fail(edge.target, "port", "No matching DSP output"); }
    return edge.source;
  }
  const outputNodes = sinks.map((sink) => producer(sink.edge));
  const positions = new Map(ordered.map((id, index) => [id, index]));
  const lastUse = new Map(positions);
  for (const [id, descriptor] of live) {
    const index = positions.get(id); if (index === undefined) { fail(id, "order", id); }
    for (const port of descriptor.inputs) {
      const edge = incoming.get(id)?.get(port); if (!edge) { fail(id, "missing_input", port); }
      const source = producer(edge); lastUse.set(source, Math.max(lastUse.get(source) ?? 0, index));
    }
  }
  for (const outputNode of outputNodes) { lastUse.set(outputNode, ordered.length); }
  const release = new Map<number, string[]>();
  for (const [id, index] of lastUse) {
    const bucket = release.get(index) ?? []; bucket.push(id); release.set(index, bucket);
  }
  // RT-D3: reserve identities in lexical order, independent of execution ordering.
  for (const id of [...live.keys()].sort(compareNames)) {
    const descriptor = live.get(id); if (!descriptor) { fail(id, "descriptor", id); }
    for (const field of descriptor.params.map((param) => param.property).sort(compareNames)) { allocator.slot(id, field); }
  }
  const buffers: Array<RealtimePlan["audio"]["buffers"][number]> = [];
  const audio: AudioNode[] = []; const params: PlanParameter[] = []; const stateKeys: StateKey[] = [];
  const physical = new Map<string, number>(); const free: number[] = []; const pathHashes = new Map<string, string>();
  for (let index = 0; index < ordered.length; index++) {
    const id = ordered[index]; const node = nodes.get(id); const descriptor = live.get(id);
    if (!node || !descriptor) { fail(id, "descriptor", id); }
    const inputs = descriptor.inputs.map((port) => {
      const edge = incoming.get(id)?.get(port); if (!edge) { return fail(id, "missing_input", port); }
      return { node: producer(edge), output: 0 };
    });
    const bindings = descriptor.params.map((binding): PlanParameter => {
      const literal = values(node, binding);
      if (literal.length !== 1 || Math.abs(literal[0]) > 3.4028234663852886e38) { fail(id, "parameter", "Audio parameters require finite float32 scalars"); }
      const smooth = binding.smoothing?.kind ?? "none";
      if (!["none", "ramp", "onePole"].includes(smooth)) { fail(id, "parameter", "Unsupported smoothing mode"); }
      let parameter: PlanParameter = { slot: allocator.slot(id, binding.property), node: id, field: binding.property, value: literal[0], smooth, sync: "audio" };
      if (incoming.get(id)?.has(binding.property)) {
        const control = controls.bind(node, binding);
        if (control.width !== 1) { fail(id, "control_width", "Audio parameters require scalar control values"); }
        parameter = { ...parameter, audioControl: control.index };
      }
      if (binding.smoothing?.kind !== "onePole") { return parameter; }
      const timeConstant = binding.smoothing.timeConstant;
      if (!Number.isFinite(timeConstant) || timeConstant <= 0 || timeConstant > 60) { fail(id, "parameter", "Invalid one-pole time constant"); }
      return { ...parameter, timeConstant };
    });
    params.push(...bindings);
    let structural: { delayFrames?: number; bufferSlot?: string } = {}; let pcmKey: readonly unknown[] | undefined;
    if (descriptor.delayFrames) {
      const frames = values(node, descriptor.delayFrames);
      if (frames.length !== 1) { fail(id, "delay", "delayFrames requires a scalar integer"); }
      integer(frames[0], 1, 480000, id); structural = { delayFrames: frames[0] };
    }
    if (descriptor.bufferInput !== undefined) {
      const edge = incoming.get(id)?.get(descriptor.bufferInput); if (!edge) { fail(id, "missing_input", descriptor.bufferInput); }
      const source = resolvePcm(edge); structural = { bufferSlot: source.id };
      pcmKey = [null, source.id, source.contract.frames, source.contract.contentHash];
    }
    // No in-place alias contract: release input buffers only after assigning this output.
    const buffer = free.pop() ?? buffers.length;
    if (buffer === buffers.length) { buffers.push({ id: buffer, channels: session.channels }); }
    physical.set(id, buffer);
    audio.push({ node: id, kernel: descriptor.kernel, stateVersion: descriptor.stateVersion, in: inputs, out: [buffer], params: bindings.map((param) => param.slot), ...structural });
    const key = stateKey(id, descriptor.kernel, descriptor.stateVersion, session, pcmKey ?? [structural.delayFrames ?? null]);
    stateKeys.push({ node: id, kind: "audio", key });
    // RT-F48: exclude physical buffer IDs and param slot IDs from the logical upstream hash.
    pathHashes.set(id, hash(["audio-path-v1", key, session.seed, inputs.map((edge) => [edge.node, edge.output, pathHashes.get(edge.node)]),
      bindings.map((param) => param.audioControl === undefined ? [param.field, param.value, param.smooth, param.timeConstant ?? null] :
        [param.field, param.value, param.smooth, param.timeConstant ?? null, controls.hash(param.audioControl)])]));
    for (const source of release.get(index) ?? []) {
      const released = physical.get(source); if (released !== undefined) { free.push(released); }
    }
  }
  const outputs = sinks.map((sink, index) => {
    const source = outputNodes[index]; const buffer = physical.get(source); const subgraphHash = pathHashes.get(source);
    if (buffer === undefined || !subgraphHash) { fail(sink.node.id, "missing_input", "Audio output has no producer"); }
    return { node: sink.node.id, kind: sink.descriptor.sink, buffer, subgraphHash };
  });
  const plan: RealtimePlan = { schemaVersion: 1, revision: input.revision,
    session: { sampleRate: session.sampleRate, quantum: session.quantum, channels: session.channels, width: session.width, height: session.height, seed: session.seed },
    params: params.sort((a, b) => a.slot - b.slot), slots: slots.sort((a, b) => compareNames(a.id, b.id)), control: controls.program(), render: { passes: [] },
    audio: { buffers, nodes: audio, sinks: outputs } };
  return { status: "ok", plan, boundaries: boundaries.sort((a, b) => compareNames(a.slot, b.slot)), warnings: [], allocation: allocator.snapshot(), stateKeys: [...stateKeys, ...controls.stateKeys()] };
}
