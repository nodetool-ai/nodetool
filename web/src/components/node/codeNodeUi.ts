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
 * A Code node materialized from one of the user's saved scripts. It is a
 * regular Code node — its body is visible and its title is its own — so this
 * only tells the UI where the node came from.
 */
export function isCustomCodeNode(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && data.codeNodeMode === "custom";
}

/**
 * Monaco language id for a code node's `code` property, derived from its
 * node_type. The Code node runs JavaScript in a sandbox; any other node with an
 * inline `code` property falls back to plain text.
 */
export function getCodeNodeLanguage(nodeType: string): string {
  return nodeType === CODE_NODE_TYPE ? "javascript" : "text";
}

/** Human label for a Monaco language id, shown in the code body toolbar. */
export function codeLanguageLabel(language: string): string {
  return language === "javascript" ? "JavaScript" : "Code";
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

const INPUT_NODE_PREFIX = "nodetool.input.";

export function resolveNodeHeaderTitle(
  nodeType: string,
  dataTitle: string | undefined,
  metadataTitle: string,
  propertyName?: string
): string {
  if (nodeType.startsWith(INPUT_NODE_PREFIX)) {
    const name = propertyName?.trim();
    if (name) {
      return name;
    }
    return metadataTitle;
  }
  return resolveCodeNodeTitle(nodeType, dataTitle, metadataTitle);
}

export function isCodeNodeTitleEditable(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && !isSnippetCodeNode(nodeType, data);
}
