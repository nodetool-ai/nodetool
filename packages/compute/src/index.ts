// Worker provisioning package (`@nodetool-ai/compute`).
// Further exports (reaper) are added by subsequent tasks.
export { WorkerManager } from "./manager.js";
export type { WorkerConnection, WorkerManagerDeps } from "./manager.js";
export { RunpodPodProvider } from "./providers/runpod.js";
export type {
  ProviderInstance,
  ProvisionResult,
  WorkerProvider,
  WorkerSpec,
  WorkerStatus,
  WorkerTarget,
} from "./providers/types.js";
