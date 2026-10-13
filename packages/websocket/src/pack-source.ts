import { randomUUID } from "node:crypto";
import type { BuiltinNodePack } from "@nodetool-ai/protocol";
import type { BuiltinPackPolicy, NodeRegistry } from "@nodetool-ai/node-sdk";

export interface PackSource {
  readonly register: (
    registry: NodeRegistry,
    policy: BuiltinPackPolicy,
    onSkipped?: (pack: BuiltinNodePack, reason: string) => void
  ) => void | Promise<void>;
  readonly setEnabled: (
    registry: NodeRegistry,
    id: string,
    enabled: boolean
  ) => void | Promise<void>;
  readonly unavailableReason: (
    pack: BuiltinNodePack,
    policy: BuiltinPackPolicy
  ) => string | undefined;
  readonly registerProviders: (policy: BuiltinPackPolicy) => void | Promise<void>;
}

let bundledSource: Promise<PackSource> | undefined;
let hostSource: PackSource | undefined;

/** Share the host's source with headless services that create their own registry. */
export function setDefaultPackSource(source: PackSource): void {
  hostSource = source;
}

function importAttemptUrl(resolved: string): string {
  const url = new URL(resolved);
  // Node retains failed ESM initialization jobs. A retry needs a fresh entry.
  url.searchParams.set("nodetool-source-attempt", randomUUID());
  return url.href;
}

async function importBundledSource(): Promise<PackSource> {
  let resolved: string;
  try {
    // Resolve only this package here. Errors in a resolved source must propagate.
    resolved = import.meta.resolve("@nodetool-ai/server");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND")) {
      throw error;
    }
    const fallback = import.meta.resolve("@nodetool-ai/base-nodes/server-pack-source");
    const module: { readonly createBundledPackSource: () => PackSource } = await import(importAttemptUrl(fallback));
    return module.createBundledPackSource();
  }
  const module: { readonly bundledPackSource: PackSource } = await import(importAttemptUrl(resolved));
  return module.bundledPackSource;
}

/** Temporary compatibility source until the catalog-backed entry lands in A2. */
export function loadBundledPackSource(): Promise<PackSource> {
  if (hostSource) {
    return Promise.resolve(hostSource);
  }
  bundledSource ??= importBundledSource().catch((error: unknown) => {
    bundledSource = undefined;
    throw error;
  });
  return bundledSource;
}
