/**
 * Generate NodeMetadata entries for code snippets so they appear in the node menu
 * under `nodetool.code.<category>`, alongside the normal code nodes.
 *
 * Input and output types are inferred from the snippet code via AST parsing,
 * with the category providing a default type hint.
 */
import { CODE_SNIPPETS, type CodeSnippet, type SnippetCategory } from "./codeSnippets";
import type { NodeMetadata } from "../stores/ApiTypes";
import { inferOutputKeysFromCode, inferInputKeysFromCode } from "../utils/codeOutputInference";

export const SNIPPET_NODE_PREFIX = "nodetool.";

/** Convert a category name to a namespace slug: "Boolean & Logic" → "boolean_logic" */
function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Map snippet categories to their default type */
const CATEGORY_TYPE: Record<SnippetCategory, string> = {
  "Boolean & Logic": "bool",
  "Math": "float",
  "Text": "str",
  "Regex": "str",
  "List": "list",
  "Dictionary": "dict",
  "Date & Time": "str",
  "UUID": "str",
  "HTTP": "str",
  "JSON": "str",
  "Streaming": "str",
};

/** Build the virtual node_type for a snippet */
export function snippetNodeType(snippet: CodeSnippet): string {
  return `${SNIPPET_NODE_PREFIX}${categoryToSlug(snippet.category)}.${snippet.id.replace(/-/g, "_")}`;
}

/** Look up a snippet by its virtual node_type */
export function findSnippetByNodeType(nodeType: string): CodeSnippet | undefined {
  return CODE_SNIPPETS.find((s) => snippetNodeType(s) === nodeType);
}

/** Generate metadata records for all snippets */
export function generateSnippetMetadata(): Record<string, NodeMetadata> {
  const result: Record<string, NodeMetadata> = {};

  for (const snippet of CODE_SNIPPETS) {
    const nodeType = snippetNodeType(snippet);
    const namespace = `${SNIPPET_NODE_PREFIX}${categoryToSlug(snippet.category)}`;
    const defaultType = CATEGORY_TYPE[snippet.category] || "str";

    const inputKeys = inferInputKeysFromCode(snippet.code) || [];
    const outputKeys = inferOutputKeysFromCode(snippet.code) || ["output"];

    const properties = inputKeys.map((name) => ({
      name,
      type: { type: defaultType, type_args: [] as never[], optional: false },
      default: defaultType === "bool" ? false
        : defaultType === "float" ? 0
        : defaultType === "list" ? []
        : defaultType === "dict" ? {}
        : "",
      required: false
    }));

    const outputs = outputKeys.map((name) => ({
      name,
      type: { type: defaultType, type_args: [] as never[], optional: false },
      stream: false
    }));

    result[nodeType] = {
      title: snippet.title,
      description: `${snippet.description}\n    ${snippet.tags.join(", ")}`,
      namespace,
      node_type: nodeType,
      layout: "default",
      basic_fields: inputKeys,
      is_dynamic: true,
      properties,
      outputs,
      recommended_models: [],
      expose_as_tool: false,
      supports_dynamic_outputs: true,
      is_streaming_output: false,
      required_settings: []
    };
  }

  return result;
}
