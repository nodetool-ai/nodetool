/**
 * API Types — Re-exports from @nodetool-ai/protocol shared types.
 *
 * These types are used throughout the mobile app and are now sourced from
 * the shared protocol package instead of auto-generated OpenAPI types.
 *
 * The openapi-fetch client (src/api.ts) still provides the generated
 * path-typed HTTP interface. This file bridges the two type systems.
 */

import type {
  // Graph & Node types
  Node as _Node,
  Edge,
  // Asset types
  Asset,
  // Workflow types
  Workflow as _Workflow,
  WorkflowGraph as _WorkflowGraph,
  // Thread & Message types
  Thread,
  Message,
  MessageContent,
  // Node Metadata types
  PropertyTypeMetadata,
  Property,
  OutputSlot,
  NodeMetadata as _NodeMetadata,
  // Job types
  RunJobRequest as _RunJobRequest,
  // Model types
  ProviderInfo,
  LanguageModel,
  ModelPack,
  // WebSocket message types
  NodeUpdate,
  OutputUpdate,
  NodeProgress,
  TaskUpdate,
  JobUpdate,
  Chunk,
  PlanningUpdate,
  Prediction,
} from "@nodetool-ai/protocol";

// ── Re-exports ─────────────────────────────────────────────────────────
// Graph & Node
export type Node = _Node;
export type { Edge };

// Asset
export type { Asset };

// Workflow
export type WorkflowGraph = _WorkflowGraph;
export type Workflow = _Workflow;

// Thread & Message
export type { Thread, Message, MessageContent };

// Node Metadata
export type { Property, OutputSlot };
export type { PropertyTypeMetadata };

// Job
export interface RunJobRequest extends _RunJobRequest {
  application_id?: string | null;
  application_version?: number | null;
  operation_id?: string | null;
}

// Models
export type { ProviderInfo, LanguageModel };

// WebSocket message types
export type {
  NodeUpdate,
  OutputUpdate,
  NodeProgress,
  TaskUpdate,
  JobUpdate,
  Chunk,
  PlanningUpdate,
  Prediction,
};

// ── Mobile-only types (not in protocol) ───────────────────────────────

export interface NodeMetadata
  extends Omit<
    _NodeMetadata,
    "basic_fields" | "is_dynamic" | "expose_as_tool" | "supports_dynamic_inputs"
  > {
  basic_fields?: string[];
  is_dynamic?: boolean;
  expose_as_tool?: boolean;
  supports_dynamic_inputs: boolean;
  searchInfo?: {
    score?: number;
    matches?: Array<{
      key: string;
      value: string;
      indices: number[][];
    }>;
  };
  model_packs?: ModelPack[];
}
