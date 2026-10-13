import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { DOCUMENT_NODES } from "./nodes/document.js";
import { LIB_PDF_NODES } from "./nodes/lib-pdf.js";

export * from "./nodes/document.js";
export * from "./nodes/lib-pdf.js";

export const ALL_DOCUMENT_NODES: readonly NodeClass[] = [
  ...DOCUMENT_NODES,
  ...LIB_PDF_NODES,
];

export function registerDocumentNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_DOCUMENT_NODES) {
    registry.register(nodeClass);
  }
}
