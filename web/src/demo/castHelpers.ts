/**
 * Shared builders for authoring synthetic demo casts (sampleCast, tutorialCast,
 * and the beginner tutorial casts).
 *
 * A synthetic cast fabricates well-formed node metadata and a time-stamped
 * timeline of protocol messages, so the DemoPlayer replays it with no backend
 * and no generated assets (image bytes are inline SVG data URIs). These helpers
 * cut the per-cast boilerplate down to the parts that actually differ.
 */
import type {
  NodeMetadata,
  OutputSlot,
  Property,
  PropertyTypeMetadata,
} from "../stores/ApiTypes";
import type { CastEvent } from "./castTypes";

export const propType = (type: string): PropertyTypeMetadata => ({
  type,
  optional: false,
  type_args: [],
});

export const prop = (name: string, type: string): Property => ({
  name,
  type: propType(type),
  default: undefined,
  title: name,
  description: null,
  min: null,
  max: null,
  json_schema_extra: null,
  required: false,
});

export const out = (name: string, type: string, stream = false): OutputSlot => ({
  name,
  type: propType(type),
  stream,
});

export const meta = (
  partial: Partial<NodeMetadata> & Pick<NodeMetadata, "node_type">
): NodeMetadata => ({
  title: partial.node_type.split(".").pop() ?? partial.node_type,
  description: "",
  namespace: partial.node_type.split(".").slice(0, -1).join("."),
  layout: "default",
  properties: [],
  outputs: [],
  recommended_models: [],
  inline_fields: [],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false,
  ...partial,
});

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  ui_properties: {
    position: { x: number; y: number };
    zIndex: number;
    width: number;
    selectable: boolean;
    title: string;
  };
  dynamic_properties: Record<string, unknown>;
  dynamic_outputs: Record<string, unknown>;
}

export const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  title: string,
  data: Record<string, unknown> = {}
): GraphNode => ({
  id,
  type,
  data,
  ui_properties: { position: { x, y }, zIndex: 0, width, selectable: true, title },
  dynamic_properties: {},
  dynamic_outputs: {},
});

export const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
) => ({ id, source, sourceHandle, target, targetHandle });

/** Bind the message-builders to one workflow + job id pair. */
export function castMessages(workflowId: string, jobId: string) {
  const base = { workflow_id: workflowId, job_id: jobId };

  const jobUpdate = (
    t: number,
    status: "running" | "completed",
    result?: Record<string, unknown>
  ): CastEvent => ({
    t,
    message: { type: "job_update", status, ...(result ? { result } : {}), ...base },
  });

  const nodeUpdate = (
    t: number,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    status: "running" | "completed",
    result?: Record<string, unknown>
  ): CastEvent => ({
    t,
    message: {
      type: "node_update",
      status,
      node_id: nodeId,
      node_name: nodeName,
      node_type: nodeType,
      ...(result ? { result } : {}),
      ...base,
    },
  });

  const chunk = (t: number, nodeId: string, content: string): CastEvent => ({
    t,
    message: { type: "chunk", node_id: nodeId, content_type: "text", content, ...base },
  });

  const edgeUpdate = (
    t: number,
    edgeId: string,
    status: "active" | "completed"
  ): CastEvent => ({
    t,
    message: { type: "edge_update", edge_id: edgeId, status, ...base },
  });

  const output = (
    t: number,
    nodeId: string,
    nodeName: string,
    outputName: string,
    value: unknown,
    outputType: string
  ): CastEvent => ({
    t,
    message: {
      type: "output_update",
      node_id: nodeId,
      node_name: nodeName,
      output_name: outputName,
      value,
      output_type: outputType,
      metadata: {},
      ...base,
    },
  });

  /** Stream `text` split into `chunks` evenly across [startMs, startMs+spanMs]. */
  const stream = (
    nodeId: string,
    chunks: string[],
    startMs: number,
    spanMs: number
  ): CastEvent[] =>
    chunks.map((content, i) =>
      chunk(Math.round(startMs + (spanMs * i) / chunks.length), nodeId, content)
    );

  /** A 1..total progress ramp across [startMs, startMs+spanMs]. */
  const progress = (
    nodeId: string,
    total: number,
    startMs: number,
    spanMs: number
  ): CastEvent[] =>
    Array.from({ length: total }, (_, i) => {
      const step = i + 1;
      return {
        t: Math.round(startMs + (spanMs * step) / total),
        message: {
          type: "node_progress",
          node_id: nodeId,
          progress: step,
          total,
          ...base,
        },
      } satisfies CastEvent;
    });

  return { jobUpdate, nodeUpdate, chunk, edgeUpdate, output, stream, progress };
}
