import type {
  SandboxModuleDeclaration,
  SandboxModuleResolution,
  SandboxModuleStatus,
  SandboxModuleSummary
} from "@nodetool-ai/protocol";

/**
 * Read-only sandbox module catalog injected by the host that discovered packs.
 * Runtime owns this contract; package discovery adapters live in node-sdk.
 */
export interface SandboxModuleCatalog {
  summaries(): readonly SandboxModuleSummary[];
  resolveForExecution(
    declarations: readonly SandboxModuleDeclaration[]
  ): SandboxModuleResolution;
  diagnostics(): readonly SandboxModuleStatus[];
}
