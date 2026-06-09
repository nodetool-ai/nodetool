import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { findInputHandle } from "./handleUtils";
import { isCollectType } from "./TypeHandler";

type FindNode = (id: string) => Node<NodeData> | undefined;
type GetMetadata = (nodeType: string) => NodeMetadata | undefined;

/**
 * Shared builder for the property overrides that the partial-run paths inject in
 * place of edges they don't submit (single-node "Run Node"/"Run from here" via
 * {@link buildRunSubgraph}, and "run selected nodes"). Both seed a target node's
 * inputs from upstream values that won't run as part of the partial graph.
 *
 * Accumulates every external upstream value per (targetNode, targetHandle) in
 * the order it's added, then resolves: a handle fed by 2+ upstreams aggregates
 * into a list when the handle is a list/collect type — mirroring the kernel's
 * multi-edge list aggregation. Without this, two edges wired into one
 * `list[image]` handle collapse to a single image (last-write-wins).
 */
export class EdgeOverrideCollector {
  private readonly byNode = new Map<string, Map<string, unknown[]>>();

  /** Record one resolved upstream value for a target node's input handle. */
  add(nodeId: string, handle: string, value: unknown): void {
    let handles = this.byNode.get(nodeId);
    if (!handles) {
      handles = new Map();
      this.byNode.set(nodeId, handles);
    }
    const values = handles.get(handle) ?? [];
    values.push(value);
    handles.set(handle, values);
  }

  /**
   * Resolve accumulated values into final per-node override records. A single
   * edge passes its value through unchanged (so an edge already carrying a list
   * isn't double-wrapped); only when 2+ edges feed one handle do we consult
   * metadata to decide whether to aggregate into a list.
   */
  resolve(
    findNode: FindNode,
    getMetadata: GetMetadata
  ): Map<string, Record<string, unknown>> {
    const overrides = new Map<string, Record<string, unknown>>();
    for (const [nodeId, handles] of this.byNode) {
      const node = findNode(nodeId);
      const meta = node?.type ? getMetadata(node.type) : undefined;
      const resolved: Record<string, unknown> = {};
      for (const [handle, values] of handles) {
        if (values.length <= 1) {
          resolved[handle] = values[0];
          continue;
        }
        let isCollect = false;
        if (node && meta) {
          const inputHandle = findInputHandle(node, handle, meta);
          isCollect = inputHandle?.type
            ? isCollectType(inputHandle.type)
            : false;
        }
        resolved[handle] = isCollect ? values : values[values.length - 1];
      }
      overrides.set(nodeId, resolved);
    }
    return overrides;
  }
}

/**
 * Merge override values into a node's properties, routing each key to
 * `dynamic_properties` when the node already carries it there, otherwise to
 * static `properties`. Returns the node unchanged when there are no overrides.
 */
export function applyNodeOverrides(
  node: Node<NodeData>,
  overrides: Record<string, unknown> | undefined
): Node<NodeData> {
  if (!overrides || Object.keys(overrides).length === 0) {
    return node;
  }
  const dynamicProps = node.data?.dynamic_properties || {};
  const staticProps = node.data?.properties || {};
  const updatedDynamicProps = { ...dynamicProps };
  const updatedStaticProps = { ...staticProps };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
      updatedDynamicProps[key] = value;
    } else {
      updatedStaticProps[key] = value;
    }
  }
  return {
    ...node,
    data: {
      ...node.data,
      properties: updatedStaticProps,
      dynamic_properties: updatedDynamicProps
    }
  };
}
