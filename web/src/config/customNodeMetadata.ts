/**
 * Node-menu metadata for the user's custom nodes.
 *
 * A custom node is a JS script document whose owner set `palette` on it. The
 * records here are virtual the way snippet records are: they exist between the
 * menu and the drop, the registry never hears about them, and the saved graph
 * carries a plain `nodetool.code.Code` node instead
 * (see `instantiatePaletteNode`).
 *
 * Ports map straight across — a script declares them, so nothing is inferred.
 * There is no menu-side streaming-input flag: `NodeMetadata` has no such field,
 * and the placed Code node derives it from its own body
 * (`usesStreamInputContract`) when the graph is hydrated.
 */
import type { jsScripts } from "@nodetool-ai/protocol/api-schemas";

import type {
  NodeMetadata,
  Property,
  PropertyTypeMetadata
} from "../stores/ApiTypes";

export const CUSTOM_NODE_PREFIX = "user.";

/**
 * One saved script exposed in the menu, as the palette query hands it back.
 * The document is structural rather than the schema type: the tRPC client's
 * output type differs from the protocol's inferred type in optionality nothing
 * here reads.
 */
export interface CustomNodeScript {
  id: string;
  name: string;
  /** The version the menu pins; a dropped node records it as provenance. */
  version: number;
  document: {
    description: string;
    code: string;
    inputs: readonly jsScripts.JsScriptPort[];
    outputs: readonly jsScripts.JsScriptPort[];
    secrets: readonly string[];
    timeoutSeconds: number;
    palette?: { category: string };
  };
}

/** "My API" → "my_api". Same slugging the snippet palette uses. */
function categoryToSlug(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/&/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "my_nodes"
  );
}

/**
 * The virtual type for one custom node. Keyed on the script id, not its name:
 * ids are stable and unique, names collide and get renamed, and the string is
 * never saved anywhere.
 */
export function customNodeType(script: CustomNodeScript): string {
  const slug = categoryToSlug(script.document.palette?.category ?? "");
  return `${CUSTOM_NODE_PREFIX}${slug}.${script.id.replace(/-/g, "_")}`;
}

/** Value a slot of `type` starts with when the script declares no default. */
function defaultValueForType(
  type: string
): string | number | boolean | unknown[] | object | null {
  switch (type) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    case "list":
      return [];
    case "dict":
      return {};
    case "str":
    case "any":
      return "";
    default:
      // Media and object refs have no meaningful empty literal; the node
      // renders an empty slot until something is connected or picked.
      return null;
  }
}

const typeMetadata = (type: string): PropertyTypeMetadata => ({
  type,
  type_args: [],
  optional: false
});

export function generateCustomNodeMetadata(
  scripts: readonly CustomNodeScript[]
): Record<string, NodeMetadata> {
  const result: Record<string, NodeMetadata> = {};

  for (const script of scripts) {
    const palette = script.document.palette;
    if (!palette) continue;

    const nodeType = customNodeType(script);
    const namespace = `${CUSTOM_NODE_PREFIX}${categoryToSlug(palette.category)}`;

    const properties: Property[] = script.document.inputs.map((port) => ({
      name: port.name,
      type: typeMetadata(port.type),
      default: defaultValueForType(port.type),
      required: false
    }));

    const outputs = script.document.outputs.map((port) => ({
      name: port.name,
      type: typeMetadata(port.type),
      stream: false
    }));

    result[nodeType] = {
      title: script.name,
      description: script.document.description,
      namespace,
      node_type: nodeType,
      layout: "default",
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true,
      properties,
      outputs,
      recommended_models: [],
      is_streaming_output: false,
      required_settings: []
    };
  }

  return result;
}

/**
 * The scripts the menu is currently showing, keyed by their virtual type.
 * `instantiatePaletteNode` runs synchronously, so the drop reads the document
 * from here rather than awaiting a fetch; `useCustomNodeMetadata` publishes it
 * from the same query that generated the metadata.
 */
let customNodeScripts: Record<string, CustomNodeScript> = {};

export function setCustomNodeScripts(
  scripts: readonly CustomNodeScript[]
): void {
  customNodeScripts = Object.fromEntries(
    scripts
      .filter((script) => script.document.palette !== undefined)
      .map((script) => [customNodeType(script), script])
  );
}

export function findCustomNodeScript(
  nodeType: string
): CustomNodeScript | undefined {
  return nodeType.startsWith(CUSTOM_NODE_PREFIX)
    ? customNodeScripts[nodeType]
    : undefined;
}
