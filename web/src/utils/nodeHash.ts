import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { isString } from "./typePredicates";

/**
 * Content-addressed node hashing for run-subgraph caching.
 *
 * See docs/superpowers/specs/2026-06-27-run-subgraph-caching.md.
 *
 *  - `inputSignature(id)` — a stable digest of a node's *effective inputs*
 *    (its type, execution-affecting config, bypass flag, and the output
 *    identities of its upstreams). Pure function of the graph + the generation
 *    table; carries NO notion of time (TTL lives in the reuse resolver, not the
 *    hash). Two nodes with the same signature have the same inputs.
 *  - `outputIdentity(id)` — how a node identifies what it emits to consumers:
 *      constant   → value-derived (its output IS its config)
 *      computed   → its inputSignature (output is a function of inputs)
 *      generative → its current generation id (opaque, non-deterministic root)
 *
 * Neither is stored on `node.data`; both are derived and memoized per hasher.
 */

export type NodeKind = "constant" | "generative" | "computed";

export interface HasherContext {
  findNode: (_id: string) => Node<NodeData> | undefined;
  /** Edges whose `target` is the given node id. */
  inboundEdges: (_id: string) => Edge[];
  getMetadata: (_type: string) => NodeMetadata | undefined;
  /**
   * The current generation id for a generative source (its `selected_generation`
   * else latest completed). Used as the generative node's output identity so a
   * downstream cache invalidates when the user re-runs or re-points it.
   */
  currentGenerationId: (_id: string) => string | undefined;
}

interface NodeHasher {
  classify: (_id: string) => NodeKind;
  inputSignature: (_id: string) => string;
  outputIdentity: (_id: string) => string;
}

const NONE = "∅";
const SEP = "\u0000";

/** cyrb53 — small, fast, well-distributed non-crypto string hash. */
const hash = (str: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * An asset-valued property: identify it by its durable id/uri so an in-memory
 * bitmap (or other transient fields) doesn't change the signature. An EMPTY
 * id/uri is not a durable ref — inline values like a JSON constant's
 * `{ type: "json", uri: "", data: … }` carry their content in other fields, so
 * they must fall through to full-record hashing rather than collapse to the
 * single identity `asset:` (which would ignore `data` and let a downstream
 * computed cache reuse stale output when the inline value changes).
 */
const assetId = (v: Record<string, unknown>): string | undefined => {
  const id = v.asset_id ?? v.assetId ?? v.uri;
  return isString(id) && id !== "" ? id : undefined;
};

/** Canonical, stable serialization (sorted keys; assets reduced to id/uri). */
const canonical = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return String(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    const aid = assetId(value);
    if (aid !== undefined) return `asset:${aid}`;
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
};

const omitKeys = (
  obj: Record<string, unknown>,
  keys: ReadonlySet<string>
) => {
  if (keys.size === 0) return obj;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (!keys.has(k)) out[k] = obj[k];
  }
  return out;
};

/**
 * Execution-affecting config only — excludes all UI-only fields, AND any
 * property/dynamic-property key fed by an inbound edge (`edgeFedHandles`). An
 * edge-fed handle's value is already captured by the upstream's outputIdentity,
 * so hashing the stored property too is redundant — and harmful: the kernel
 * echoes `node.properties` back on completion and handleUpdate writes the
 * inlined runtime value into the live node, which would otherwise shift the
 * node's own signature off its dispatch-time stamp and defeat computed caching.
 */
const normalizedConfig = (
  node: Node<NodeData>,
  edgeFedHandles: ReadonlySet<string> = new Set()
): string =>
  canonical({
    p: omitKeys(node.data?.properties ?? {}, edgeFedHandles),
    d: omitKeys(node.data?.dynamic_properties ?? {}, edgeFedHandles)
  });

const isConstantType = (type?: string): boolean =>
  !!type &&
  (type.startsWith("nodetool.constant.") || type.startsWith("nodetool.input."));

export const createNodeHasher = (ctx: HasherContext): NodeHasher => {
  const sigCache = new Map<string, string>();
  const visiting = new Set<string>();

  const classify = (id: string): NodeKind => {
    const node = ctx.findNode(id);
    if (!node?.type) return "computed";
    if (isConstantType(node.type)) return "constant";
    if (ctx.getMetadata(node.type)?.auto_save_asset) return "generative";
    return "computed";
  };

  const inputSignature = (id: string): string => {
    const cached = sigCache.get(id);
    if (cached !== undefined) return cached;
    // Cycle guard: a back-edge contributes a stable placeholder rather than
    // recursing forever. Cyclic regions are reused/run as a unit (see spec §8).
    if (visiting.has(id)) return `cycle:${id}`;
    visiting.add(id);

    const node = ctx.findNode(id);
    let sig: string;
    if (!node) {
      sig = hash(`missing${SEP}${id}`);
    } else {
      const inbound = ctx.inboundEdges(id).filter((e) => e.targetHandle);
      // Properties fed by an inbound edge are excluded from the config hash —
      // their value rides the upstream's outputIdentity below (see normalizedConfig).
      const edgeFedHandles = new Set(
        inbound.map((e) => e.targetHandle as string)
      );
      const upstream = inbound
        .map(
          (e) =>
            `${e.targetHandle}=${outputIdentity(e.source)}@${e.sourceHandle ?? ""}`
        )
        .sort();
      sig = hash(
        [
          "v1",
          node.type ?? "",
          normalizedConfig(node, edgeFedHandles),
          String(node.data?.bypassed ?? false),
          upstream.join("|")
        ].join(SEP)
      );
    }

    visiting.delete(id);
    sigCache.set(id, sig);
    return sig;
  };

  const outputIdentity = (id: string): string => {
    const node = ctx.findNode(id);
    if (!node) return hash(`missing${SEP}${id}`);
    const kind = classify(id);
    if (kind === "generative") {
      // Multi-select replay: when ≥2 generations are selected the node emits the
      // ordered set as a stream, so its output identity is that ordered set — not
      // the single current id. Otherwise a downstream cache would NOT invalidate
      // when the selection changes (e.g. [a,b] → [a,c]). Order matters (replay
      // streams in pick order). `selected_generations` affects what the node
      // emits, so it belongs here even though it's excluded from the node's own
      // input config.
      const selected = node.data?.selected_generations;
      if (Array.isArray(selected) && selected.length >= 2) {
        return hash(["multiselect", ...selected].join(SEP));
      }
      return ctx.currentGenerationId(id) ?? NONE;
    }
    if (kind === "constant") {
      return hash(["const", node.type ?? "", normalizedConfig(node)].join(SEP));
    }
    return inputSignature(id);
  };

  return { classify, inputSignature, outputIdentity };
};

/**
 * Compute the `inputSignature` for each of `nodeIds` against the FULL graph in
 * `ctx` (spec §3.4 stamping). Builds one hasher with the SAME `createNodeHasher`
 * the reuse resolver uses, so a signature stamped here matches a later
 * `resolve` / `buildRunSubgraph` lookup. Pass the live full graph in `ctx` (not
 * a pruned subgraph) — the resolver hashes against the full graph too.
 */
export const computeInputSignatures = (
  nodeIds: Iterable<string>,
  ctx: HasherContext
) => {
  const hasher = createNodeHasher(ctx);
  const signatures: Record<string, string> = {};
  for (const id of nodeIds) {
    signatures[id] = hasher.inputSignature(id);
  }
  return signatures;
};
