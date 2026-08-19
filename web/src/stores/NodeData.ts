import { TypeMetadata } from "./ApiTypes";

/**
 * Declaration of one dynamic input slot: the type half of a typed dynamic
 * slot. The value half stays in `dynamic_properties[name]`.
 *
 * A name present in `dynamic_properties` with no declaration here is an
 * untyped legacy slot and behaves as `any` — that is how every workflow saved
 * before typed slots existed loads.
 *
 * Mirrors `DynamicSlotMeta` in `@nodetool-ai/protocol`. Schema resolvers
 * (FAL/Kie/Replicate/Comfy) emit a flatter shape with the TypeMetadata spread
 * at the top level; `normalizeDynamicSlots` in `utils/dynamicSlots.ts`
 * converts it at the resolver boundary so the store only ever holds this one.
 */
export type DynamicSlotDeclaration = {
  type: TypeMetadata;
  description?: string;
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
};

export type NodeData = {
  properties: Record<string, unknown>;
  selectable: boolean | undefined;
  dynamic_properties: Record<string, unknown>;
  /** Typed slot declarations for dynamic inputs, keyed by slot name. */
  dynamic_inputs?: Record<string, DynamicSlotDeclaration>;
  dynamic_outputs?: Record<string, TypeMetadata>;
  /** Resolved FAL model/endpoint id (e.g. fal-ai/flux-pro) when schema is loaded */
  endpoint_id?: string;
  /** Resolved Kie.ai model id when schema is loaded */
  model_id?: string;
  /** Persisted id of the generation chosen to feed downstream (asset id for media). */
  selected_generation?: string;
  /** Ordered ids of generations chosen to feed downstream as a list. <=1 -> single-selection behavior. */
  selected_generations?: string[];
  workflow_id: string;
  title?: string;
  /**
   * How a Code node came to be. `"snippet"` locks title editing and hides the
   * code by default; `"custom"` marks one materialized from the user's own
   * saved script, which keeps both.
   */
  codeNodeMode?: "snippet" | "custom";
  color?: string;
  collapsed?: boolean;
  /** Last expanded body height (px) before header-only collapse — restore on expand; not in `properties` */
  expandedHeightPx?: number;
  /** Last expanded width (px) before header-only collapse — restore on expand; not in `properties` */
  expandedWidthPx?: number;
  bypassed?: boolean; // When true, node is bypassed and passes inputs through to outputs
  showResultPreference?: boolean; // User preference: true = show results after run, false/undefined = show inputs
  /**
   * Advanced properties promoted as handle-only dots on the left edge (plan §8.4).
   * Mutually exclusive with `exposedInputsLabeled` per property name.
   */
  exposedInputs?: string[];
  /**
   * Properties shown as labeled rows at the bottom (handle + title + editors).
   * Overrides metadata defaults when set explicitly.
   */
  exposedInputsLabeled?: string[];
  /**
   * Properties hidden on the node body (inspector only). Used when cycling
   * metadata input_fields / inline_fields off their default placement.
   */
  exposedInputsHidden?: string[];
  // Original node type from the workflow graph (useful when React Flow falls back to "default" type)
  originalType?: string;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
