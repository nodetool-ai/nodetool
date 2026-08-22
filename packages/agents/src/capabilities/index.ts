/**
 * Capabilities: the shape that replaces the `Tool` class.
 *
 * Design: docs/tool-class-retirement-design.md
 */

export { PERMISSION_CATEGORIES } from "./types.js";
export type {
  AvailableSecretsResolver,
  CapabilitySpec,
  CapabilityImpl,
  CapabilityRun,
  CapabilityModule,
  CapabilityExport,
  CapabilityGate,
  CapabilityLoaders,
  ClientToolRouter,
  SecretPrompt,
  SecretPromptRequest,
  SecretPromptStatus,
  SubAgentRuntime,
  PermissionCategory
} from "./types.js";
export {
  toolFromLazyCapability,
  toolForCapabilityName
} from "./lazy-tool.js";
export {
  DECLARED_CAPABILITY_MODULES,
  listCapabilitySpecs,
  capabilitySpec,
  capabilityModuleSpecTable,
  loadCapabilityImpl,
  eagerSpecDrift,
  loadCapabilityModule,
  listCapabilityModules,
  loadAllCapabilityModules,
  findCapability,
  capabilityCategorySnapshot,
  capabilityModuleIssues,
  capabilityModuleDrift
} from "./registry.js";
export {
  SandboxCapabilityError,
  capabilityModuleSpecs,
  createCapabilityDispatcher
} from "./dispatcher.js";
export type { SandboxCapabilityDispatcher } from "./dispatcher.js";
export {
  CapabilityTool,
  toolFromCapability,
  capabilityFromTool
} from "./adapters.js";
export type { CapabilityRunSource } from "./adapters.js";
export {
  UNGATED,
  contextSecretAvailability,
  createCapabilityRun,
  resolveCapabilityMessage,
  ungatedCapabilityRun
} from "./invoke.js";
export type { CreateCapabilityRunOptions } from "./invoke.js";
