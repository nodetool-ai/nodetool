import type { InputMode, NodeEffect, OutputCorrelation, Platform } from "@nodetool-ai/protocol";

export interface TypeMetadata {
  type: string;
  optional?: boolean;
  values?: Array<string | number>;
  type_args: TypeMetadata[];
  type_name?: string | null;
}

export interface PropertyMetadata {
  name: string;
  type: TypeMetadata;
  default?: unknown;
  title?: string | null;
  description?: string | null;
  min?: number | null;
  max?: number | null;
  values?: Array<string | number> | null;
  json_schema_extra?: Record<string, unknown> | null;
  required?: boolean;
}

export interface OutputSlotMetadata {
  type: TypeMetadata;
  name: string;
  stream?: boolean;
}

export interface NodeMetadata {
  title: string;
  description: string;
  namespace: string;
  node_type: string;
  layout?: string;
  /**
   * Node body renderer key. "content_card" makes the frontend render a
   * media/text-forward content card instead of the generic input/output body.
   * Node authors opt in via the class's `body` static (TS) or `_body`/`body()`
   * (Python). Absent or "default" → generic body.
   */
  body?: string;
  properties: PropertyMetadata[];
  outputs: OutputSlotMetadata[];

  recommended_models?: unknown[];
  inline_fields?: string[];
  input_fields?: string[];
  required_settings?: string[];
  /**
   * Runtime packages this node depends on (e.g. "python", "yt-dlp", "ollama").
   * The frontend uses this to show install prompts before execution.
   */
  required_runtimes?: string[];
  supports_dynamic_inputs?: boolean;
  /**
   * Types a user may pick for a dynamic input slot on this node. Unset means
   * the full type palette. See `BaseNode.allowedDynamicSlotTypes`.
   */
  allowed_dynamic_slot_types?: TypeMetadata[];
  is_streaming_input?: boolean;
  is_streaming_output?: boolean;
  input_mode?: InputMode;
  output_correlation?: Record<string, OutputCorrelation>;
  is_controlled?: boolean;
  /** §7 — Zip/Cross nodes opt out of the incomparable-scope check. */
  is_join_node?: boolean;
  /**
   * Trigger node: compiles to a `trigger_registrations` row on activation
   * and enters via `emitTriggerEvent` when a run carries a trigger event.
   */
  is_trigger?: boolean;
  /** Emit output_update even for connected handles (UI-monitor nodes). */
  always_emit_output_updates?: boolean;
  supports_dynamic_outputs?: boolean;
  auto_save_asset?: boolean;
  /**
   * Opt-in: re-running the node with identical inputs is safe. Absent means
   * unsafe, so the supervisor withholds `retry`. See `BaseNode.retrySafe`.
   */
  retry_safe?: boolean;
  /** See `BaseNode.appendStaticInputs`. */
  append_static_inputs?: string[];
  /**
   * Per-type cache lifetime for partial runs (seconds, or the `"forever"`
   * sentinel — never `Infinity`, which is not JSON-safe). Only consulted for
   * Computed nodes. Unset / `0` = never reuse. See `BaseNode.cacheTtl` and
   * docs/superpowers/specs/2026-06-27-run-subgraph-caching.md §4.
   */
  cache_ttl?: number | "forever";
  /**
   * What running the node does to the world. Reactive runs (mini-app sliders,
   * live previews) traverse "pure" and "read" only. Absent is treated as
   * "external". See `BaseNode.effect`.
   */
  effect?: NodeEffect;
  /**
   * Names the output slot carrying the node's primary generation (persisted
   * value + content-card preview). Absent falls back to the first output.
   */
  primary_output?: string;
  model_packs?: unknown[];
  /**
   * Deployment platforms this node supports. Absent or empty values are
   * treated as ["node"] (most restrictive). See `@nodetool-ai/protocol`'s
   * Platform type for the closed set.
   */
  platforms?: readonly Platform[];
  /** When true, the node remains runnable but should be deprioritized in search. */
  deprecated?: boolean;
  /**
   * When true, the node is registered and runnable but hidden from discovery
   * UIs (palette, search) entirely — for internal nodes a user never adds by
   * hand (e.g. agent-runner-inserted steps).
   */
  hidden?: boolean;
  /** Preferred replacement node_type when deprecated is true. */
  replaced_by?: string;
}

export interface PropOptions {
  type: string;
  default?: unknown;
  title?: string;
  description?: string;
  min?: number;
  max?: number;
  required?: boolean;
  values?: Array<string | number>;
  json_schema_extra?: Record<string, unknown>;
}

export interface DeclaredPropertyMetadata {
  name: string;
  options: PropOptions;
}

export interface NodeCatalogEntry { readonly node_type: string; readonly pack: string; readonly metadata: NodeMetadata; readonly declared: readonly DeclaredPropertyMetadata[] }
