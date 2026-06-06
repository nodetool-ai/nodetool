import type { NodeClass } from "@nodetool-ai/node-sdk";
import { CREATE_IMAGE_NODES } from "./nodes/create-image.js";
import { EDIT_IMAGE_NODES } from "./nodes/edit-image.js";
import { REMIX_IMAGE_NODES } from "./nodes/remix-image.js";

export { CreateImageNode } from "./nodes/create-image.js";
export { EditImageNode } from "./nodes/edit-image.js";
export { RemixImageNode } from "./nodes/remix-image.js";
export * from "./reve-base.js";

export const REVE_NODES: readonly NodeClass[] = [
  ...CREATE_IMAGE_NODES,
  ...EDIT_IMAGE_NODES,
  ...REMIX_IMAGE_NODES
];

export function registerReveNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of REVE_NODES) {
    registry.register(nodeClass);
  }
}
