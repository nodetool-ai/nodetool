/**
 * Deterministic mutant corpus for the crash fuzzer.
 *
 * Same seed, same corpus — so a crash the nightly run finds replays exactly,
 * and Stryker's mutation score over the parser files is stable between runs.
 */

import type { NodeMetadata } from "../../src/metadata.js";
import type { GraphValidationRegistry } from "../../src/graph-validation.js";
import { validateNodeProperties } from "../../src/validation.js";
import type { DeclaredPropertyMetadata } from "../../src/decorators.js";
import { SEED_CODE_BODIES, SEED_GRAPHS } from "./seeds.js";

/** Mulberry32. */
export function makeRand(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Values that break the schema while keeping the document valid JSON. */
const HOSTILE_VALUES: readonly unknown[] = [
  null,
  [],
  {},
  "",
  "\u0000",
  "x".repeat(4096),
  -1,
  1e308,
  Number.NaN,
  true,
  { $ref: "#/" },
  [[[[[[[[[[1]]]]]]]]]]
];

export type GraphMutation =
  | "dropKey"
  | "hostileValue"
  | "retypeKey"
  | "danglingEdge"
  | "duplicateId"
  | "selfCycle"
  | "emptyHalf"
  | "deepNest";

export const GRAPH_MUTATIONS: readonly GraphMutation[] = [
  "dropKey",
  "hostileValue",
  "retypeKey",
  "danglingEdge",
  "duplicateId",
  "selfCycle",
  "emptyHalf",
  "deepNest"
];

type JsonObject = Record<string, unknown>;

function objectsIn(value: unknown, found: JsonObject[]): JsonObject[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      objectsIn(item, found);
    }
  } else if (value !== null && typeof value === "object") {
    found.push(value as JsonObject);
    for (const item of Object.values(value as JsonObject)) {
      objectsIn(item, found);
    }
  }
  return found;
}

function nodesOf(doc: JsonObject): JsonObject[] {
  return Array.isArray(doc.nodes) ? (doc.nodes as JsonObject[]) : [];
}

function edgesOf(doc: JsonObject): JsonObject[] {
  return Array.isArray(doc.edges) ? (doc.edges as JsonObject[]) : [];
}

function applyGraphMutation(
  doc: JsonObject,
  mutation: GraphMutation,
  rand: () => number
): void {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

  switch (mutation) {
    case "dropKey":
    case "hostileValue":
    case "retypeKey": {
      const targets = objectsIn(doc, []);
      const target = pick(targets);
      const keys = Object.keys(target);
      if (keys.length === 0) {
        return;
      }
      const key = pick(keys);
      if (mutation === "dropKey") {
        delete target[key];
      } else if (mutation === "hostileValue") {
        target[key] = pick(HOSTILE_VALUES);
      } else {
        target[key] = Array.isArray(target[key]) ? {} : [];
      }
      return;
    }
    case "danglingEdge": {
      const edges = edgesOf(doc);
      if (edges.length > 0) {
        pick(edges).source = "node-that-does-not-exist";
      }
      return;
    }
    case "duplicateId": {
      const nodes = nodesOf(doc);
      if (nodes.length > 1) {
        nodes[1].id = nodes[0].id;
      }
      return;
    }
    case "selfCycle": {
      const nodes = nodesOf(doc);
      const edges = edgesOf(doc);
      if (nodes.length > 0 && Array.isArray(doc.edges)) {
        edges.push({
          id: "fuzz-cycle",
          source: nodes[0].id,
          sourceHandle: "output",
          target: nodes[0].id,
          targetHandle: "value"
        });
      }
      return;
    }
    case "emptyHalf": {
      doc[rand() < 0.5 ? "nodes" : "edges"] = pick(HOSTILE_VALUES);
      return;
    }
    case "deepNest": {
      const nodes = nodesOf(doc);
      if (nodes.length === 0) {
        return;
      }
      // 2000 levels: deep enough that a naive recursive walk overflows the
      // stack, shallow enough that JSON.stringify of the corpus stays cheap.
      let nested: unknown = 1;
      for (let i = 0; i < 2000; i += 1) {
        nested = { nested };
      }
      const node = nodes[0];
      const bag = (node.properties ?? node.data) as JsonObject | undefined;
      if (bag) {
        bag.fuzz = nested;
      } else {
        node.properties = { fuzz: nested };
      }
    }
  }
}

export interface GraphMutant {
  id: string;
  source: string;
  mutation: GraphMutation;
  graph: { nodes?: unknown; edges?: unknown };
}

export function graphCorpus(seed: number, perSeed: number): GraphMutant[] {
  const rand = makeRand(seed);
  const mutants: GraphMutant[] = [];
  for (const source of SEED_GRAPHS) {
    for (let i = 0; i < perSeed; i += 1) {
      const doc = JSON.parse(JSON.stringify(source.graph)) as JsonObject;
      const mutation =
        GRAPH_MUTATIONS[Math.floor(rand() * GRAPH_MUTATIONS.length)];
      applyGraphMutation(doc, mutation, rand);
      mutants.push({
        id: `${source.id}#${i}`,
        source: source.id,
        mutation,
        graph: doc as GraphMutant["graph"]
      });
    }
  }
  return mutants;
}

export type CodeMutation =
  | "truncate"
  | "deleteChar"
  | "duplicateFragment"
  | "injectNull"
  | "unbalance"
  | "hugeIdentifier"
  | "deepParens";

export const CODE_MUTATIONS: readonly CodeMutation[] = [
  "truncate",
  "deleteChar",
  "duplicateFragment",
  "injectNull",
  "unbalance",
  "hugeIdentifier",
  "deepParens"
];

function applyCodeMutation(
  code: string,
  mutation: CodeMutation,
  rand: () => number
): string {
  const at = (limit: number) => Math.floor(rand() * Math.max(limit, 1));
  switch (mutation) {
    case "truncate":
      return code.slice(0, at(code.length));
    case "deleteChar": {
      const i = at(code.length);
      return code.slice(0, i) + code.slice(i + 1);
    }
    case "duplicateFragment": {
      const i = at(code.length);
      return code.slice(0, i) + code.slice(i, i + 12) + code.slice(i);
    }
    case "injectNull": {
      const i = at(code.length);
      return `${code.slice(0, i)}\u0000${code.slice(i)}`;
    }
    case "unbalance":
      return `${code}\n}`;
    case "hugeIdentifier":
      return `${code}\nconst ${"z".repeat(8192)} = 1;`;
    case "deepParens":
      // Balanced but 5000 deep: an AST walk without a depth guard overflows.
      return `${code}\nconst deep = ${"(".repeat(5000)}1${")".repeat(5000)};`;
  }
}

export interface CodeMutant {
  id: string;
  source: string;
  mutation: CodeMutation;
  code: string;
}

export function codeCorpus(seed: number, perSeed: number): CodeMutant[] {
  const rand = makeRand(seed ^ 0x5bf03635);
  const mutants: CodeMutant[] = [];
  for (const source of SEED_CODE_BODIES) {
    for (let i = 0; i < perSeed; i += 1) {
      const mutation =
        CODE_MUTATIONS[Math.floor(rand() * CODE_MUTATIONS.length)];
      mutants.push({
        id: `${source.id}#${i}`,
        source: source.id,
        mutation,
        code: applyCodeMutation(source.code, mutation, rand)
      });
    }
  }
  return mutants;
}

/**
 * A registry built from the seed graphs: every seed node type is known, and
 * its handles are whatever the seeds connect. Mutants therefore hit the
 * validator's "known type, wrong shape" paths rather than bailing out at
 * `unknown_node`, which is where the crashes live.
 *
 * A dynamic slot is deliberately *not* a declared property here. Deriving both
 * from the same bag made every node's slots look statically declared, which
 * left the whole dynamic-slot half of the validator — `untyped_dynamic_slot`,
 * the typed-slot type check, the dynamic-output handle check — unreachable.
 */
export function seedRegistry(): GraphValidationRegistry {
  const inputs = new Map<string, Set<string>>();
  const outputs = new Map<string, Set<string>>();
  const dynamicInputs = new Map<string, Set<string>>();
  const dynamicOutputs = new Map<string, Set<string>>();
  const typeOfNode = new Map<string, string>();

  const namesOf = (
    map: Map<string, Set<string>>,
    type: string
  ): Set<string> => {
    const existing = map.get(type);
    if (existing) return existing;
    const created = new Set<string>();
    map.set(type, created);
    return created;
  };

  for (const { graph } of SEED_GRAPHS) {
    for (const raw of graph.nodes) {
      const node = raw as JsonObject;
      const type = String(node.type);
      typeOfNode.set(String(node.id), type);
      const bag = (node.properties ?? node.data ?? {}) as JsonObject;
      const declared = namesOf(inputs, type);
      for (const key of Object.keys(bag)) {
        declared.add(key);
      }
      const slots = namesOf(dynamicInputs, type);
      for (const key of Object.keys(
        (node.dynamic_inputs ?? {}) as JsonObject
      )) {
        slots.add(key);
      }
      for (const key of Object.keys(
        (node.dynamic_properties ?? {}) as JsonObject
      )) {
        slots.add(key);
      }
      const emitted = namesOf(dynamicOutputs, type);
      for (const key of Object.keys(
        (node.dynamic_outputs ?? {}) as JsonObject
      )) {
        emitted.add(key);
      }
      namesOf(outputs, type).add("output");
    }
    for (const raw of graph.edges) {
      const edge = raw as JsonObject;
      const sourceType = typeOfNode.get(String(edge.source));
      const targetType = typeOfNode.get(String(edge.target));
      if (sourceType && typeof edge.sourceHandle === "string") {
        outputs.get(sourceType)?.add(edge.sourceHandle);
      }
      if (targetType && typeof edge.targetHandle === "string") {
        inputs.get(targetType)?.add(edge.targetHandle);
      }
    }
  }

  // Property names carry their type so the corpus reaches the asset, model
  // and scalar branches of validateNodeProperties rather than one `str` path.
  const typeOfProperty = (name: string): string => {
    if (name === "model") {
      return "language_model";
    }
    if (name === "image") {
      return "image";
    }
    if (name === "count" || name === "n") {
      return "int";
    }
    if (name === "packages") {
      return "list";
    }
    return "str";
  };
  const REQUIRED = new Set(["value", "prompt", "code", "a", "model"]);

  const metas = new Map<string, NodeMetadata>();
  const declaredOf = new Map<string, DeclaredPropertyMetadata[]>();
  for (const type of inputs.keys()) {
    const slots = dynamicInputs.get(type) ?? new Set<string>();
    const emitted = dynamicOutputs.get(type) ?? new Set<string>();
    const names = [...(inputs.get(type) ?? []), "image"].filter(
      (name) => !slots.has(name)
    );
    metas.set(type, {
      title: type,
      description: "",
      namespace: type.split(".").slice(0, -1).join("."),
      node_type: type,
      supports_dynamic_inputs: slots.size > 0,
      supports_dynamic_outputs: emitted.size > 0,
      properties: names.map((name) => ({
        name,
        type: { type: typeOfProperty(name) }
      })),
      outputs: [...(outputs.get(type) ?? [])]
        .filter((name) => !emitted.has(name))
        .map((name) => ({ name, type: { type: "str" } }))
    } as unknown as NodeMetadata);
    declaredOf.set(
      type,
      names.map((name) => ({
        name,
        options: {
          type: typeOfProperty(name),
          required: REQUIRED.has(name)
        }
      })) as unknown as DeclaredPropertyMetadata[]
    );
  }

  return {
    has: (type) => metas.has(type),
    getMetadata: (type) => metas.get(type),
    // The real property validator, not a stand-in: `validation.ts` is one of
    // the files the crash corpus is scored against, and a stub would leave
    // every mutant of it uncovered.
    validateNode: (descriptor, connectedHandles) =>
      validateNodeProperties(
        declaredOf.get(descriptor.type) ?? [],
        descriptor.properties ?? {},
        {
          connectedHandles,
          nodeId: descriptor.id,
          nodeType: descriptor.type,
          dynamicSlots: descriptor.dynamic_inputs,
          dynamicValues: descriptor.dynamic_properties
        }
      ),
    listProviderIds: () => ["openai", "anthropic"],
    listModelIds: (provider) => (provider === "openai" ? ["gpt-5"] : undefined)
  };
}
