/**
 * The CLI's sandbox pack catalog, apart from the node registry so a harness
 * that runs sandbox code without node types does not load every node package.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverSandboxCatalog } from "@nodetool-ai/node-sdk";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import { createCachedNpmLookup } from "@nodetool-ai/sandbox-compiler/cache";
import { z } from "zod";

/** The one field this module reads off a pack's `package.json`; everything else in the file is irrelevant here. */
const packageJsonTypesField = z
  .object({ types: z.string().trim().min(1).optional() })
  .passthrough();

/** The pack's declared `types` path, or `undefined` for any reason — missing file, invalid JSON, no `types` field. Never throws. */
function readPackageJsonTypesField(packageJsonPath: string): string | undefined {
  if (!existsSync(packageJsonPath)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return undefined;
  }
  const parsed = packageJsonTypesField.safeParse(raw);
  return parsed.success ? parsed.data.types : undefined;
}

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

/**
 * `specifier -> absolute path to that installed pack's shipped .d.ts`, read
 * from each discovered pack's own `package.json` `types` field (a pack ships
 * none by declaring no `types` field, which this simply leaves out). Used by
 * `jsscript validate` to type-check a script's imports against the packs it
 * actually has installed — see `@nodetool-ai/execution`'s `type-check.ts`.
 * Runs discovery again rather than threading it through
 * {@link installSandboxCatalog}, which only keeps the catalog; this stays a
 * separate, cheap, synchronous call so a caller that does not need types
 * pays nothing for them.
 */
export function discoverPackDtsSources(): ReadonlyMap<string, string> {
  const sources = new Map<string, string>();
  try {
    const { discoveries } = discoverSandboxCatalog();
    for (const discovery of discoveries) {
      const types = readPackageJsonTypesField(join(discovery.dir, "package.json"));
      if (types === undefined) continue;
      const dtsPath = join(discovery.dir, types);
      if (existsSync(dtsPath)) sources.set(discovery.name, dtsPath);
    }
  } catch {
    // Discovery failure here is the same non-fatal case installSandboxCatalog
    // already warns about; a caller that wants types simply gets none.
  }
  return sources;
}
