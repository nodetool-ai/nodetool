/**
 * The server's sandbox module catalog.
 *
 * Built where packs are discovered, installed as this process's catalog default
 * so every {@link ProcessingContext} the kernel creates resolves through the
 * same instance, and kept here for diagnostics. These statuses are their own
 * set — a sandbox module that fails discovery says nothing about whether the
 * pack's *nodes* loaded, which is what `pack-snapshot.ts` reports.
 */

import {
  discoverSandboxCatalog,
  type SandboxCatalogHost
} from "@nodetool-ai/node-sdk";
import {
  setProcessSandboxModuleCatalog,
  type SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import type { SandboxModuleStatus } from "@nodetool-ai/protocol";

let host: SandboxCatalogHost | null = null;

/**
 * Rebuild the catalog from the installed packs and make it the process default.
 * Runs already in flight keep the catalog instance they resolved against.
 */
export function refreshSandboxCatalog(
  searchPaths?: readonly string[]
): SandboxCatalogHost {
  host = searchPaths === undefined
    ? discoverSandboxCatalog()
    : discoverSandboxCatalog(searchPaths);
  setProcessSandboxModuleCatalog(host.catalog);
  return host;
}

/** The catalog in force, or null before the host built one. */
export function getSandboxCatalog(): SandboxModuleCatalog | null {
  return host?.catalog ?? null;
}

/** Every sandbox-module diagnostic from the last discovery. */
export function getSandboxCatalogDiagnostics(): readonly SandboxModuleStatus[] {
  return host?.catalog.diagnostics() ?? [];
}
