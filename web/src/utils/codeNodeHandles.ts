/**
 * Implicit Code-node handles: names the body already reads or writes.
 *
 * The editor shows these as handles even when the node has not stored them
 * in `dynamic_properties` / `dynamic_outputs`. Agents connect to the same
 * names — they do not have to add a dynamic slot first.
 */
import { CODE_NODE_TYPE } from "../constants/nodeTypes";
import type { NodeData } from "../stores/NodeData";
import {
  inferInputKeysFromCode,
  inferOutputKeysFromCode
} from "./codeOutputInference";
import { isString } from "./typePredicates";

export function isCodeNodeType(nodeType: string | undefined): boolean {
  return nodeType === CODE_NODE_TYPE;
}

function codePropertyFromData(data: NodeData | undefined): string {
  const code = data?.properties?.code;
  return isString(code) ? code : "";
}

export function inferredCodeInputNames(
  code: string,
  nodeType?: string
): string[] {
  if (nodeType !== undefined && !isCodeNodeType(nodeType)) return [];
  return inferInputKeysFromCode(code) ?? [];
}

export function inferredCodeOutputNames(
  code: string,
  nodeType?: string
): string[] {
  if (nodeType !== undefined && !isCodeNodeType(nodeType)) return [];
  return inferOutputKeysFromCode(code) ?? [];
}

export function inferredCodeInputNamesFromData(
  data: NodeData | undefined,
  nodeType?: string
): string[] {
  return inferredCodeInputNames(codePropertyFromData(data), nodeType);
}

export function inferredCodeOutputNamesFromData(
  data: NodeData | undefined,
  nodeType?: string
): string[] {
  return inferredCodeOutputNames(codePropertyFromData(data), nodeType);
}
