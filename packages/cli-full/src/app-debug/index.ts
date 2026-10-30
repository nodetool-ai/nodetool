/**
 * The CLI's app-debug surface: target resolution plus the bundle-writing
 * harness, over the simulator in `@nodetool-ai/execution/app-debug`. The
 * simulator's exports are re-exported here so importers keep one entry point.
 */
export { runAppDebug, defaultInteractions } from "./harness.js";
export type { AppDebugDeps } from "./harness.js";
export { resolveAppTarget } from "./app-target.js";
export type {
  AppApplicationRecord,
  AppTargetDeps,
  AppWorkflowRecord
} from "./app-target.js";
export {
  bindingScopeFor,
  documentOperations,
  effectiveTimeoutMs,
  extractAppIO,
  HeadlessAppRuntime,
  InMemoryResourceProvider,
  operationSpec,
  parseAppDocument,
  parseAppSpec,
  renderAppReportMarkdown,
  seedResourceHint,
  simulateApp,
  validateApp
} from "@nodetool-ai/execution/app-debug";
export type * from "@nodetool-ai/execution/app-debug";
