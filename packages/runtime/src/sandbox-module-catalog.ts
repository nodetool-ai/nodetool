import type {
  SandboxModuleDeclaration,
  SandboxModuleResolution,
  SandboxModuleStatus,
  SandboxModuleSummary,
  SandboxPackSkillDisclosure
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
  /**
   * A pack's SKILL.md with the trust decision attached, when the host read one.
   * Optional: a catalog assembled somewhere without pack documentation (a
   * browser host, a fixture) answers nothing, and every caller must handle
   * that anyway — a pack may simply ship no skill.
   */
  packSkill?(packName: string): SandboxPackSkillDisclosure | undefined;
}

let processCatalog: SandboxModuleCatalog | null = null;

/**
 * Install the catalog every {@link ProcessingContext} in this process falls back
 * to when its constructor is given none.
 *
 * The catalog stays an injected dependency: a caller that passes
 * `sandboxModuleCatalog` explicitly — including `null` — always wins. This is
 * the host's default, set once where packs are discovered, so the twenty-odd
 * context construction sites do not each have to thread it through. A soft pack
 * reload calls this again with the rebuilt catalog; runs already in flight keep
 * the instance they captured.
 */
export function setProcessSandboxModuleCatalog(
  catalog: SandboxModuleCatalog | null
): void {
  processCatalog = catalog;
}

/** The process-wide catalog default, or null when no host installed one. */
export function getProcessSandboxModuleCatalog(): SandboxModuleCatalog | null {
  return processCatalog;
}
