import { TypeMetadata } from "./ApiTypes";

export type NodeData = {
  properties: Record<string, unknown>;
  selectable: boolean | undefined;
  dynamic_properties: Record<string, unknown>;
  /** Schema-defined input types + descriptions (e.g. from FAL resolve); used for correct types and connection-only inputs */
  dynamic_inputs?: Record<
    string,
    TypeMetadata & { description?: string; min?: number; max?: number; default?: unknown }
  >;
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
  /** Marks snippet-backed Code nodes so the UI can lock title editing and hide code by default. */
  codeNodeMode?: "snippet";
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
