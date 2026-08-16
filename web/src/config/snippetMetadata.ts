/**
 * Generate NodeMetadata entries for code snippets so they appear in the node menu
 * under `nodetool.code.<category>`, alongside the normal code nodes.
 *
 * Input and output types are inferred from the snippet code via AST parsing,
 * with the category providing a default type hint.
 */
import {
  CODE_SNIPPETS,
  type CodeSnippet,
  type SnippetCategory
} from "./codeSnippets";
import type {
  NodeMetadata,
  Property,
  PropertyTypeMetadata
} from "../stores/ApiTypes";
import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode
} from "../utils/codeOutputInference";

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
  Math: "float",
  Text: "str",
  Regex: "str",
  List: "list",
  Dictionary: "dict",
  "Date & Time": "str",
  UUID: "str",
  JSON: "str",
  Streaming: "str",
  Path: "str",
  Files: "str",
  // Every lib.svg element node outputs `svg_element`, so this is exact as an
  // *output* default — these connect straight into the Document / SVGToImage
  // nodes, which take `list[svg_element]`. It is wrong for inputs, which is
  // what CATEGORY_INPUT_TYPE below corrects.
  SVG: "svg_element",
  HTTP: "str",
  Markdown: "list",
  HTML: "list",
  Validation: "bool"
};

/**
 * Categories whose input default differs from their output default.
 *
 * A single per-category type cannot be right for both halves of an SVG
 * snippet: the output is always an `svg_element`, the inputs are coordinates,
 * colours and path data. The 12 shipped `svg-*` snippets declare every input
 * explicitly, so this only covers a snippet added later without declarations —
 * `any` leaves those handles promiscuous instead of falsely gating them to
 * `svg_element`.
 */
const CATEGORY_INPUT_TYPE: Partial<Record<SnippetCategory, string>> = {
  SVG: "any"
};

/** Value a slot of `type` starts with when the snippet declares no default. */
function defaultValueForType(
  type: string
): string | number | boolean | unknown[] | object {
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
    default:
      return "";
  }
}

/** Build the virtual node_type for a snippet */
export function snippetNodeType(snippet: CodeSnippet): string {
  return `${SNIPPET_NODE_PREFIX}${categoryToSlug(snippet.category)}.${snippet.id.replace(/-/g, "_")}`;
}

/** Look up a snippet by its virtual node_type */
export function findSnippetByNodeType(
  nodeType: string
): CodeSnippet | undefined {
  return CODE_SNIPPETS.find((s) => snippetNodeType(s) === nodeType);
}

/** Generate metadata records for all snippets */
export function generateSnippetMetadata() {
  const result: Record<string, NodeMetadata> = {};

  for (const snippet of CODE_SNIPPETS) {
    const nodeType = snippetNodeType(snippet);
    const namespace = `${SNIPPET_NODE_PREFIX}${categoryToSlug(snippet.category)}`;
    const outputType = CATEGORY_TYPE[snippet.category] || "str";
    const inputType = CATEGORY_INPUT_TYPE[snippet.category] ?? outputType;

    const inputKeys = inferInputKeysFromCode(snippet.code) || [];
    const outputKeys = inferOutputKeysFromCode(snippet.code) || ["output"];

    const properties = inputKeys.map((name) => {
      const declared = snippet.inputs?.[name];
      const type = declared?.type ?? inputType;
      const property: Property = {
        name,
        type: {
          type,
          type_args: [] as PropertyTypeMetadata[],
          optional: false
        },
        default:
          declared && "default" in declared
            ? declared.default
            : defaultValueForType(type),
        required: false
      };
      if (declared?.description !== undefined) {
        property.description = declared.description;
      }
      if (declared?.min !== undefined) property.min = declared.min;
      if (declared?.max !== undefined) property.max = declared.max;
      return property;
    });

    const outputs = outputKeys.map((name) => ({
      name,
      type: {
        type: snippet.outputs?.[name] ?? outputType,
        type_args: [] as PropertyTypeMetadata[],
        optional: false
      },
      stream: false
    }));

    result[nodeType] = {
      title: snippet.title,
      description: `${snippet.description}\n    ${snippet.tags.join(", ")}`,
      namespace,
      node_type: nodeType,
      layout: "default",
      supports_dynamic_inputs: true,
      properties,
      outputs,
      recommended_models: [],
      supports_dynamic_outputs: true,
      is_streaming_output: false,
      required_settings: []
    };
  }

  return result;
}
