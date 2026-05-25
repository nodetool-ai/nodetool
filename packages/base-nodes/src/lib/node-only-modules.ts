/**
 * Lazy loaders for Node.js built-in modules that block static portability.
 *
 * Nodes that call into these should declare `static platforms = ["node"]`
 * — the module remains loadable on every runtime (the dynamic import is
 * never evaluated at module-init time), but the specific node fails at
 * call time if invoked off-Node. The platform filter prevents that from
 * happening in normal use.
 *
 * Centralised here so the classifier can attribute the dynamic-import
 * blocker to a single source path; per-module imports of these helpers
 * are relative and don't appear in the external-import set.
 */

export async function loadNodeFsPromises(): Promise<
  typeof import("node:fs").promises
> {
  const mod = await import("node:fs");
  return mod.promises;
}

export async function loadNodeFsSync(): Promise<typeof import("node:fs")> {
  return import("node:fs");
}

export async function loadNodePath(): Promise<typeof import("node:path")> {
  return import("node:path");
}

export async function loadNodeOs(): Promise<typeof import("node:os")> {
  return import("node:os");
}

export async function loadNodeUrl(): Promise<typeof import("node:url")> {
  return import("node:url");
}
