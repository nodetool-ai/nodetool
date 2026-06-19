import type { NodeData } from "../../stores/NodeData";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { CODE_NODE_TYPE } from "../../constants/nodeTypes";

export { CODE_NODE_TYPE };

export function isCodeNode(nodeType: string): boolean {
  return nodeType === CODE_NODE_TYPE;
}

export function isSnippetCodeNode(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && data.codeNodeMode === "snippet";
}

/**
 * Monaco language id for a code node's `code` property, derived from its
 * node_type. The universal Code node and ExecuteJavaScript run JS; the
 * remaining `nodetool.code.*` executors each map to their interpreter.
 * Falls back to plain text for unknown node types.
 */
export function getCodeNodeLanguage(nodeType: string): string {
  switch (nodeType) {
    case "nodetool.code.ExecutePython":
      return "python";
    case "nodetool.code.ExecuteJavaScript":
    case CODE_NODE_TYPE:
      return "javascript";
    case "nodetool.code.ExecuteBash":
      return "bash";
    case "nodetool.code.ExecuteRuby":
      return "ruby";
    case "nodetool.code.ExecuteLua":
    case "nodetool.code.EvaluateExpression":
      return "lua";
    default:
      return "text";
  }
}

/**
 * Brief explanation of how a code node's inputs and outputs are managed,
 * shown in place of the generic "Add input" / "Add output" buttons. Code
 * nodes derive their handles from the code itself, so the buttons would be
 * misleading; this hint tells the user what to do instead.
 *
 * - The universal Code node infers handles from the code: undeclared
 *   identifiers become inputs, the keys of the returned object become outputs.
 * - The language executors inject connected inputs as variables (local vars,
 *   or environment variables for Bash/Ruby) and report results on stdout/stderr.
 */
export function getCodeNodeIOHint(nodeType: string): string {
  if (isCodeNode(nodeType)) {
    return "Reference an undefined variable to add an input. Return an object — its keys become outputs.";
  }
  const language = getCodeNodeLanguage(nodeType);
  const inputKind =
    language === "bash" || language === "ruby"
      ? "environment variables"
      : language === "lua"
        ? "variables"
        : "local variables";
  return `Connect a value to add an input, passed to your code as ${inputKind}. Results come from stdout and stderr.`;
}

/** Human label for a Monaco language id, shown in the code body toolbar. */
export function codeLanguageLabel(language: string): string {
  switch (language) {
    case "python":
      return "Python";
    case "javascript":
      return "JavaScript";
    case "bash":
      return "Bash";
    case "ruby":
      return "Ruby";
    case "lua":
      return "Lua";
    default:
      return "Code";
  }
}

/**
 * True when a node exposes an inline `code` string property — i.e. a code
 * executor whose body should render a Monaco editor (see `CodeBody`). Matches
 * nodes that list `"code"` in `inline_fields` and declare a matching `str`
 * property.
 */
export function hasCodeProperty(metadata: NodeMetadata | undefined): boolean {
  if (!metadata) {
    return false;
  }
  if (!(metadata.inline_fields ?? []).includes("code")) {
    return false;
  }
  const codeProp = (metadata.properties ?? []).find((p) => p.name === "code");
  return !!codeProp && codeProp.type?.type === "str";
}

/**
 * Routing predicate for the bespoke `CodeBody`. A node renders the Monaco code
 * body when it has an inline `code` property, except snippet-backed Code nodes
 * which intentionally hide their code and fall back to the generic body.
 */
export function isCodeBodyNode(
  metadata: NodeMetadata | undefined,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  if (!metadata) {
    return false;
  }
  if (isSnippetCodeNode(metadata.node_type, data)) {
    return false;
  }
  return hasCodeProperty(metadata);
}

export function resolveCodeNodeTitle(
  nodeType: string,
  dataTitle: string | undefined,
  metadataTitle: string
): string {
  if (!isCodeNode(nodeType)) {
    return metadataTitle;
  }

  const trimmedTitle = dataTitle?.trim();
  return trimmedTitle ? trimmedTitle : metadataTitle;
}

export function isCodeNodeTitleEditable(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && !isSnippetCodeNode(nodeType, data);
}
