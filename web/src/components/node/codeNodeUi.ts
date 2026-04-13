import type { NodeData } from "../../stores/NodeData";

export const CODE_NODE_TYPE = "nodetool.code.Code";

export function isCodeNode(nodeType: string): boolean {
  return nodeType === CODE_NODE_TYPE;
}

export function isSnippetCodeNode(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && data.codeNodeMode === "snippet";
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

export function resolveVisibleBasicFields(
  nodeType: string,
  basicFields: string[],
  data: Pick<NodeData, "codeNodeMode">
): string[] {
  if (!isSnippetCodeNode(nodeType, data)) {
    return basicFields;
  }

  return basicFields.filter((field) => field !== "code");
}

export function isCodeNodeTitleEditable(
  nodeType: string,
  data: Pick<NodeData, "codeNodeMode">
): boolean {
  return isCodeNode(nodeType) && !isSnippetCodeNode(nodeType, data);
}
