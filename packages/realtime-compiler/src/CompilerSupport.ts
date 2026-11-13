import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { sha256Hex } from "@nodetool-ai/protocol/sha256";
import { PLAN_SCHEMA } from "./generated/PlanSchema.js";
import type { CompileInput, Diagnostic, ParameterAllocation, ParameterIdentity, Session, ValueBinding } from "./Types.js";

export class CompileFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) { super(diagnostic.detail); }
}
export function fail(node: string, reason: string, detail: string): never { throw new CompileFailure({ node, reason, detail }); }
export function integer(value: number, min: number, max: number, node: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) { fail(node, "range", `Expected integer in [${min}, ${max}]`); }
}
export function compareNames(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function identity(node: string, field: string): string { return JSON.stringify([node, field]); }
export function hash(value: unknown): string { return sha256Hex(JSON.stringify(value)); }
export function stateKey(node: string, operation: string, version: number, session: Session, structural?: readonly unknown[]): string {
  return hash(structural === undefined ? ["control", node, operation, version, session.sampleRate, session.quantum] :
    ["audio", node, operation, version, structural, session.sampleRate, session.quantum, session.channels]);
}
export function values(node: NodeDescriptor, binding: ValueBinding): number[] {
  const value: unknown = node.properties && Object.hasOwn(node.properties, binding.property) ? node.properties[binding.property] : binding.default;
  return literalValues(value, node.id, binding.property);
}
export function literalValues(value: unknown, node: string, field: string): number[] {
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
export function prepareGraph(input: CompileInput): {
  nodes: Map<string, NodeDescriptor>; incoming: Map<string, Map<string, Edge>>;
} {
  const { session, graph } = input;
  integer(input.revision, 0, PLAN_SCHEMA.properties.revision.maximum, "$plan");
  integer(session.width, 1, 16384, "$session"); integer(session.height, 1, 16384, "$session");
  integer(session.seed, 0, 4294967295, "$session");
  if ((session.sampleRate !== 44100 && session.sampleRate !== 48000) || session.quantum !== 128 ||
      (session.channels !== "mono" && session.channels !== "stereo")) { fail("$session", "session", "Unsupported session layout"); }
  if (graph.nodes.length > 100000 || graph.edges.length > 100000) { fail("$graph", "limit", "Graph exceeds v1 compiler limits"); }
  if (input.outputs.length !== 1) { fail("$graph", "outputs", "This slice requires exactly one output"); }
  const nodes = new Map<string, NodeDescriptor>(); const incoming = new Map<string, Map<string, Edge>>();
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
  return { nodes, incoming };
}
export function parameterAllocator(previous?: ParameterAllocation) {
  const entries: ParameterIdentity[] = []; const identities = new Map<string, number>(); const slots = new Set<number>();
  let nextSlot = previous?.nextSlot ?? 0;
  integer(nextSlot, 0, 4294967296, "$params");
  if ((previous?.entries.length ?? 0) > 100000) { fail("$params", "limit", "Parameter ledger exceeds compiler limits"); }
  for (const entry of previous?.entries ?? []) {
    integer(entry.slot, 0, 4294967295, entry.node);
    const key = identity(entry.node, entry.field);
    if (!entry.node || !entry.field || identities.has(key) || slots.has(entry.slot) || entry.slot >= nextSlot) {
      fail(entry.node, "parameter_allocation", "Invalid or duplicated parameter identity/slot");
    }
    identities.set(key, entry.slot); slots.add(entry.slot); entries.push({ node: entry.node, field: entry.field, slot: entry.slot });
  }
  return {
    slot(node: string, field: string): number {
      const key = identity(node, field); const existing = identities.get(key);
      if (existing !== undefined) { return existing; }
      if (entries.length >= 100000 || nextSlot > 4294967295) { return fail(node, "limit", "Parameter allocation exhausted"); }
      const slot = nextSlot++; entries.push({ node, field, slot }); identities.set(key, slot); return slot;
    },
    snapshot(): ParameterAllocation { return { entries: entries.sort((a, b) => a.slot - b.slot), nextSlot }; }
  };
}
