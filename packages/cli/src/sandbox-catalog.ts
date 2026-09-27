/**
 * The CLI's sandbox pack catalog, apart from the node registry so a harness
 * that runs sandbox code without node types does not load every node package.
 */
import { discoverSandboxCatalog } from "@nodetool-ai/node-sdk";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import { createCachedNpmLookup } from "@nodetool-ai/sandbox-compiler/cache";

/**
 * Discover installed sandbox packs and make the catalog this process's default,
 * so the CLI's validation and execution harnesses resolve sandbox modules
 * through the same instance the server uses. Discovery executes no pack code.
 * A failure leaves the CLI without a catalog rather than without a registry.
 *
 * This path never compiles. npm-backed modules resolve only from the cache,
 * whose entries are re-verified against their inputs' current contents; a miss
 * becomes the `pending-compile` diagnostic naming `nodetool packs compile`.
 */
export function installSandboxCatalog(): void {
  try {
    setProcessSandboxModuleCatalog(
      discoverSandboxCatalog(undefined, { compiled: createCachedNpmLookup() })
        .catalog
    );
  } catch (error) {
    console.warn(
      `Sandbox module catalog unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
