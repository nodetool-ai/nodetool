/**
 * Capabilities: the shape that replaces the `Tool` class.
 *
 * Design: docs/tool-class-retirement-design.md
 */

export { PERMISSION_CATEGORIES } from "./types.js";
export type {
  CapabilitySpec,
  CapabilityImpl,
  CapabilityRun,
  CapabilityModule,
  CapabilityExport,
  CapabilityGate,
  CapabilityLoaders,
  ClientToolRouter,
  SubAgentRuntime,
  PermissionCategory
} from "./types.js";
export {
  DECLARED_CAPABILITY_MODULES,
  loadCapabilityModule,
  listCapabilityModules,
  loadAllCapabilityModules,
  findCapability,
  capabilityCategorySnapshot,
  capabilityModuleIssues,
  capabilityModuleDrift
} from "./registry.js";
export {
  CapabilityTool,
  toolFromCapability,
  capabilityFromTool
} from "./adapters.js";
export type { CapabilityRunSource } from "./adapters.js";
export {
  UNGATED,
  createCapabilityRun,
  resolveCapabilityMessage,
  ungatedCapabilityRun
} from "./invoke.js";
export type { CreateCapabilityRunOptions } from "./invoke.js";
