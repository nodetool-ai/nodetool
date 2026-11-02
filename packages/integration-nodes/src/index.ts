import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { KIE_DYNAMIC_NODES } from "./nodes/kie-dynamic.js";
import { COMFY_NODES } from "./nodes/comfy.js";
import { STABLE_DIFFUSION_CPP_NODES } from "./nodes/stable-diffusion-cpp.js";
import { WAN2GP_NODES } from "./nodes/wan2gp.js";
import { MESSAGING_NODES } from "./nodes/messaging.js";

export * from "./nodes/messaging.js";
export * from "./nodes/kie-dynamic.js";
export * from "./nodes/comfy-sdk.js";
export * from "./nodes/comfy-cloud.js";
export * from "./nodes/comfy.js";
export * from "./nodes/comfy-schema.js";
export * from "./nodes/stable-diffusion-cpp.js";
export * from "./nodes/wan2gp.js";

export const ALL_INTEGRATION_NODES: readonly NodeClass[] = [
  ...KIE_DYNAMIC_NODES,
  ...COMFY_NODES,
  ...STABLE_DIFFUSION_CPP_NODES,
  ...WAN2GP_NODES,
  ...MESSAGING_NODES,
];

export function registerIntegrationNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_INTEGRATION_NODES) {
    registry.register(nodeClass);
  }
}
