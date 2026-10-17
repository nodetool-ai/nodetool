/**
 * The "Write Code with AI" palette entry.
 *
 * A synthetic `NodeMetadata` record so the node menu can find and place AI
 * authoring the same way it finds a node. Picking it creates an ordinary
 * `nodetool.code.Code` node and opens the generation dialog against it
 * (`instantiatePaletteNode`).
 *
 * Search terms ride on `description`, the same trick `snippetMetadata.ts`
 * uses: node search ranks over title, namespace, tags, description and use
 * cases, so appending the aliases makes each of them a way to reach the entry.
 */
import type { NodeMetadata } from "../stores/ApiTypes";

export const CODE_GEN_PALETTE_NODE_TYPE = "nodetool.code.WriteCodeWithAI";

/** The verbs people search for when they want a transformation. */
export const CODE_GEN_PALETTE_ALIASES: readonly string[] = [
  "transform",
  "convert",
  "reshape",
  "merge",
  "join",
  "split",
  "extract",
  "parse",
  "format",
  "compute",
  "validate"
];

const DESCRIPTION =
  "Describe the result you want and let AI write a typed Code node for it.";

export function codeGenPaletteMetadata(): NodeMetadata {
  return {
    title: "Write Code with AI",
    description: `${DESCRIPTION}\n    ${CODE_GEN_PALETTE_ALIASES.join(", ")}`,
    namespace: "nodetool.code",
    node_type: CODE_GEN_PALETTE_NODE_TYPE,
    layout: "default",
    properties: [],
    outputs: [],
    recommended_models: [],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true,
    is_streaming_output: false,
    required_settings: []
  };
}

/** Keyed by node type, for merging into the metadata store. */
export function generateCodeGenPaletteMetadata() {
  return { [CODE_GEN_PALETTE_NODE_TYPE]: codeGenPaletteMetadata() };
}
