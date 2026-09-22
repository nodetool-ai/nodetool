import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadHiggsfieldManifest, loadHiggsfieldNodesFromManifest } from "./higgsfield-factory.js";
export * from "./higgsfield-base.js";
export * from "./higgsfield-factory.js";
export { higgsfieldSubmit, higgsfieldGetStatus, higgsfieldGetStatusByRequestId, higgsfieldAwaitResult, higgsfieldCancel, higgsfieldCancelByRequestId, higgsfieldEstimate, higgsfieldCreateUploadUrl, higgsfieldUploadMedia, higgsfieldDownloadResult } from "@nodetool-ai/runtime";
export const HIGGSFIELD_NODES: readonly NodeClass[] = loadHiggsfieldNodesFromManifest(loadHiggsfieldManifest());
export function registerHiggsfieldNodes(registry: { register: (nodeClass: NodeClass) => void }): void { for (const nodeClass of HIGGSFIELD_NODES) registry.register(nodeClass); }
