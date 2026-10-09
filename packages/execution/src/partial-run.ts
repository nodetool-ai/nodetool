/**
 * Narrow a runnable graph to the nodes a caller asked for, the server-side
 * counterpart of the editor's "Run Node" and "Run selected".
 *
 * The run keeps the named nodes plus what they need upstream. Unrelated
 * branches and downstream nodes are dropped. An upstream node that auto-saves
 * its generations (`auto_save_asset`: image, video, audio and LLM generators,
 * the nodes a provider bills) is not run again when it has a previous
 * generation: its saved output is written into the consuming node's property
 * in place of the edge, the way `buildRunSubgraph` in `web/src/utils` inlines
 * a generation's output. Everything else upstream runs.
 */
import { getAssetFileName } from "@nodetool-ai/protocol";
import type { Edge, GraphData, NodeDescriptor } from "@nodetool-ai/protocol";
import type { NodeMetadata, TypeMetadata } from "@nodetool-ai/node-sdk";

/** A previous generation of one node, as the run reuses it. */
export interface PreviousGeneration {
  /** Output values keyed by output handle. */
  outputs: Record<string, unknown>;
  jobId: string | null;
  assetIds: string[];
}

export interface PartialRunDeps {
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  /**
   * The node's previous generation, or null when it has none. Omit to run
   * every upstream node again.
   */
  loadPreviousGeneration?: (
    node: NodeDescriptor,
    metadata: NodeMetadata
  ) => Promise<PreviousGeneration | null>;
}

/** One upstream node whose saved output replaced its run. */
export interface ReusedNode {
  node_id: string;
  job_id: string | null;
  asset_ids: string[];
}

export type PartialRunPlan =
  | {
      kind: "graph";
      graph: GraphData;
      /** Every node the narrowed graph runs. */
      ran: string[];
      reused: ReusedNode[];
    }
  | { kind: "unknown_nodes"; ids: string[] };

/** The ids in `nodeIds` that name no node of `graph`. */
export function unknownNodeIds(
  graph: GraphData,
  nodeIds: readonly string[]
): string[] {
  const known = new Set(graph.nodes.map((n) => n.id));
  return nodeIds.filter((id) => !known.has(id));
}

/**
 * A generation's value for one output handle: the named handle, else the sole
 * value of a single-output generation. Mirrors `outputOf` in
 * `web/src/utils/nodeGenerations.ts`, except that a generation with several
 * other handles yields nothing rather than the whole record.
 */
export function generationOutputFor(
  outputs: Record<string, unknown>,
  handle: string | null | undefined
): unknown {
  if (handle && Object.hasOwn(outputs, handle)) return outputs[handle];
  const keys = Object.keys(outputs);
  return keys.length === 1 ? outputs[keys[0]!] : undefined;
}

const isListType = (type: TypeMetadata | undefined): boolean =>
  type?.type === "list";

/** Whether the target's input `handle` takes a list, so edges aggregate. */
function inputIsList(
  node: NodeDescriptor,
  handle: string,
  metadata: NodeMetadata | undefined
): boolean {
  const declared = metadata?.properties.find((p) => p.name === handle)?.type;
  if (declared) return isListType(declared);
  const slot = node.dynamic_inputs?.[handle] as
    | { type?: TypeMetadata }
    | undefined;
  return isListType(slot?.type);
}

/** Write inlined values into a node, keeping dynamic inputs dynamic. */
function withInlinedInputs(
  node: NodeDescriptor,
  values: Map<string, unknown>
): NodeDescriptor {
  const properties = { ...node.properties };
  const dynamic = node.dynamic_properties
    ? { ...node.dynamic_properties }
    : undefined;
  for (const [handle, value] of values) {
    if (dynamic && Object.hasOwn(dynamic, handle)) {
      dynamic[handle] = value;
    } else {
      properties[handle] = value;
    }
  }
  return dynamic
    ? { ...node, properties, dynamic_properties: dynamic }
    : { ...node, properties };
}

export async function planPartialRun(
  graph: GraphData,
  nodeIds: readonly string[],
  deps: PartialRunDeps
): Promise<PartialRunPlan> {
  const unknown = unknownNodeIds(graph, nodeIds);
  if (unknown.length > 0) {
    return { kind: "unknown_nodes", ids: unknown };
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const inbound = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    const list = inbound.get(edge.target);
    if (list) list.push(edge);
    else inbound.set(edge.target, [edge]);
  }

  const targets = new Set(nodeIds);
  const keep = new Set(nodeIds);
  const previous = new Map<string, Promise<PreviousGeneration | null>>();
  const previousOf = (node: NodeDescriptor, metadata: NodeMetadata) => {
    let pending = previous.get(node.id);
    if (!pending) {
      pending = deps.loadPreviousGeneration!(node, metadata);
      previous.set(node.id, pending);
    }
    return pending;
  };

  // Edges whose source is served from a previous generation. Only applied
  // when the source does not end up running for another reason.
  const inlined: Array<{ edge: Edge; value: unknown }> = [];
  const stack = [...nodeIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const edge of inbound.get(id) ?? []) {
      const source = nodeById.get(edge.source);
      if (!source || keep.has(source.id)) continue;
      const metadata = deps.getMetadata(source.type);
      if (
        deps.loadPreviousGeneration &&
        metadata?.auto_save_asset &&
        !targets.has(source.id) &&
        edge.edge_type !== "control" &&
        edge.targetHandle
      ) {
        const generation = await previousOf(source, metadata);
        const value = generation
          ? generationOutputFor(generation.outputs, edge.sourceHandle)
          : undefined;
        if (value !== undefined) {
          inlined.push({ edge, value });
          continue;
        }
      }
      keep.add(source.id);
      stack.push(source.id);
    }
  }

  const valuesByTarget = new Map<string, Map<string, unknown[]>>();
  const reused = new Map<string, ReusedNode>();
  for (const { edge, value } of inlined) {
    // A source that runs anyway feeds this edge itself.
    if (keep.has(edge.source)) continue;
    const handle = edge.targetHandle!;
    let handles = valuesByTarget.get(edge.target);
    if (!handles) {
      handles = new Map();
      valuesByTarget.set(edge.target, handles);
    }
    handles.set(handle, [...(handles.get(handle) ?? []), value]);
    if (!reused.has(edge.source)) {
      const generation = await previous.get(edge.source)!;
      reused.set(edge.source, {
        node_id: edge.source,
        job_id: generation?.jobId ?? null,
        asset_ids: generation?.assetIds ?? []
      });
    }
  }

  const nodes = graph.nodes
    .filter((n) => keep.has(n.id))
    .map((node) => {
      const handles = valuesByTarget.get(node.id);
      if (!handles) return node;
      const metadata = deps.getMetadata(node.type);
      const values = new Map<string, unknown>();
      for (const [handle, list] of handles) {
        // Several edges into a list input aggregate, as the kernel does;
        // anywhere else the last edge wins.
        values.set(
          handle,
          list.length > 1 && inputIsList(node, handle, metadata)
            ? list
            : list[list.length - 1]
        );
      }
      return withInlinedInputs(node, values);
    });

  return {
    kind: "graph",
    graph: {
      nodes,
      edges: graph.edges.filter(
        (e) => keep.has(e.source) && keep.has(e.target)
      )
    },
    ran: graph.nodes.filter((n) => keep.has(n.id)).map((n) => n.id),
    reused: [...reused.values()]
  };
}

// ---------------------------------------------------------------------------
// Previous generations from saved assets
// ---------------------------------------------------------------------------

/** The asset fields a generation is rebuilt from. */
export interface GenerationAssetRow {
  id: string;
  job_id: string | null;
  content_type: string;
  size: number | null;
  metadata: Record<string, unknown> | null;
}

const MEDIA_REF_TYPES: Array<[prefix: string, type: string]> = [
  ["image/", "image"],
  ["video/", "video"],
  ["audio/", "audio"],
  ["model/", "model_3d"]
];

function mediaRefType(contentType: string): string | null {
  return MEDIA_REF_TYPES.find(([prefix]) => contentType.startsWith(prefix))?.[1] ?? null;
}

function generationIndexOf(row: GenerationAssetRow): unknown {
  return row.metadata?.["generation_index"];
}

/** The node's primary output name: `primary_output`, else the first output. */
function primaryOutputName(metadata: NodeMetadata): string {
  return metadata.primary_output ?? metadata.outputs[0]?.name ?? "output";
}

/**
 * Rebuild a node's previous generation from the assets its auto-save wrote
 * (`autoSaveAssets` in the websocket package), newest first. One generation is
 * every asset one `generation_complete` produced: the same job and the same
 * `generation_index`. Returns null when nothing usable is saved, so the node
 * runs again:
 *
 *  - `pinnedId` (the editor's `selected_generation`) names an asset not in
 *    `rows`;
 *  - a text generation was saved with a truncated inline copy;
 *  - a structured generation was too large to keep inline.
 */
export function previousGenerationFromAssets(
  rows: readonly GenerationAssetRow[],
  metadata: NodeMetadata,
  pinnedId?: string
): PreviousGeneration | null {
  const chosen = pinnedId ? rows.find((r) => r.id === pinnedId) : rows[0];
  if (!chosen) return null;
  const members = (
    chosen.job_id
      ? rows.filter(
          (r) =>
            r.job_id === chosen.job_id &&
            generationIndexOf(r) === generationIndexOf(chosen)
        )
      : [chosen]
  )
    // Rows arrive newest first; a list output keeps the order it was saved in.
    .slice()
    .reverse();

  const outputs: Record<string, unknown> = {};
  const media = new Map<string, unknown[]>();
  for (const row of members) {
    const ct = row.content_type ?? "";
    const meta = row.metadata ?? {};
    const refType = mediaRefType(ct);
    if (refType) {
      const handle =
        typeof meta["output_name"] === "string"
          ? meta["output_name"]
          : primaryOutputName(metadata);
      media.set(handle, [
        ...(media.get(handle) ?? []),
        {
          type: refType,
          uri: `asset://${getAssetFileName(row.id, ct)}`,
          asset_id: row.id
        }
      ]);
    } else if (ct.startsWith("text/")) {
      const text = meta["text"];
      if (typeof text !== "string") continue;
      // The inline copy is capped; a truncated one is not the output.
      const bytes = Buffer.byteLength(text, "utf8");
      if (row.size !== null && row.size !== bytes) continue;
      outputs[primaryOutputName(metadata)] = text;
    } else if (ct.includes("json")) {
      const json = meta["json"];
      if (json && typeof json === "object" && !Array.isArray(json)) {
        Object.assign(outputs, json);
      }
    }
  }
  for (const [handle, refs] of media) {
    const declared = metadata.outputs.find((o) => o.name === handle)?.type;
    outputs[handle] = isListType(declared) ? refs : refs[refs.length - 1];
  }
  if (Object.keys(outputs).length === 0) return null;
  return {
    outputs,
    jobId: chosen.job_id,
    assetIds: members.map((r) => r.id)
  };
}
