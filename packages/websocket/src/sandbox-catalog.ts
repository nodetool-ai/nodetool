/**
 * The server's sandbox module catalog.
 *
 * Built where packs are discovered, installed as this process's catalog default
 * so every {@link ProcessingContext} the kernel creates resolves through the
 * same instance, and kept here for diagnostics. These statuses are their own
 * set — a sandbox module that fails discovery says nothing about whether the
 * pack's *nodes* loaded, which is what `pack-snapshot.ts` reports.
 *
 * The server is the async host, so this is also where npm modules compile: a
 * pack's `npm` declaration becomes a bundled, scanned, probed guest module
 * before the catalog is built. The compiler is imported lazily and its absence
 * is a diagnostic, not a failure — an npm module then stays `pending-compile`,
 * exactly as it does before anything has compiled it.
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
let compileFailure: SandboxModuleStatus | null = null;

/**
 * Rebuild the catalog from the installed packs and make it the process default.
 * Runs already in flight keep the catalog instance they resolved against.
 */
export async function refreshSandboxCatalog(
  searchPaths?: readonly string[]
): Promise<SandboxCatalogHost> {
  compileFailure = null;
  host = (await compileAndDiscover(searchPaths)) ?? discover(searchPaths);
  setProcessSandboxModuleCatalog(host.catalog);
  return host;
}

/** The catalog in force, or null before the host built one. */
export function getSandboxCatalog(): SandboxModuleCatalog | null {
  return host?.catalog ?? null;
}

/** Every sandbox-module diagnostic from the last discovery. */
export function getSandboxCatalogDiagnostics(): readonly SandboxModuleStatus[] {
  const diagnostics = host?.catalog.diagnostics() ?? [];
  return compileFailure === null ? diagnostics : [...diagnostics, compileFailure];
}

async function compileAndDiscover(
  searchPaths: readonly string[] | undefined
): Promise<SandboxCatalogHost | undefined> {
  let compileSandboxCatalog: (options?: {
    searchPaths?: readonly string[];
  }) => Promise<SandboxCatalogHost>;
  try {
    ({ compileSandboxCatalog } = (await import(
      "@nodetool-ai/sandbox-compiler"
    )));
  } catch (error) {
    compileFailure = {
      packName: "@nodetool-ai/sandbox-compiler",
      status: "warning",
      code: "compiler-unavailable",
      message: `The npm module compiler is unavailable, so npm-backed sandbox modules stay uncompiled: ${message(error)}`
    };
    return undefined;
  }
  try {
    return await compileSandboxCatalog(
      searchPaths === undefined ? {} : { searchPaths }
    );
  } catch (error) {
    compileFailure = {
      packName: "@nodetool-ai/sandbox-compiler",
      status: "warning",
      code: "compile-failed",
      message: `Compiling npm sandbox modules failed, so they stay uncompiled: ${message(error)}`
    };
    return undefined;
  }
}

function discover(searchPaths: readonly string[] | undefined): SandboxCatalogHost {
  return searchPaths === undefined
    ? discoverSandboxCatalog()
    : discoverSandboxCatalog(searchPaths);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
