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
  Node,
  Edge,
  // Asset types
  Asset,
  // Workflow types
  Workflow,
  WorkflowGraph,
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
  RunJobRequest,
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
export type { Node, Edge };

// Asset
export type { Asset };

// Workflow
export type { Workflow, WorkflowGraph };

// Thread & Message
export type { Thread, Message, MessageContent };

// Node Metadata
export type { Property, OutputSlot };
export type { PropertyTypeMetadata };

// Job
export type { RunJobRequest };

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

export interface NodeMetadata extends _NodeMetadata {
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
