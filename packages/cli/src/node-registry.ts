/**
 * Builds a NodeRegistry with installed TypeScript packs and catalog metadata
 * for missing enabled packs. Shared by the debug, validate, and single-node-run harnesses so they
 * all resolve node types against the same set.
 *
 * Python-only node packs (huggingface worker nodes, mlx, etc.) are not
 * registered here — they have no TS class and are resolved lazily through the
 * Python bridge at execution time. Static tools (validate) therefore treat
 * unknown types as "not in the local TS registry".
 */
import { NodeRegistry, type BuiltinPackPolicy } from "@nodetool-ai/node-sdk";
import { registerAvailablePacks } from "@nodetool-ai/node-catalog";

import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { installSandboxCatalog } from "./sandbox-catalog.js";

/** CLI harnesses expose optional packs independently of user toggles. */
export const CLI_BUILTIN_PACK_POLICY: BuiltinPackPolicy = {
  includeOptionalPacks: true,
  excludedPackIds: ["kie", "topaz", "higgsfield", "together"]
};

/** Workflow JSON runs and local MCP historically omit AtlasCloud too. */
export const CLI_LOCAL_BUILTIN_PACK_POLICY = {
  ...CLI_BUILTIN_PACK_POLICY,
  excludedPackIds: [
    ...(CLI_BUILTIN_PACK_POLICY.excludedPackIds ?? []),
    "atlascloud"
  ]
};

/** DSL files import provider nodes themselves, so only the required base pack is bootstrapped. */
export const CLI_DSL_BUILTIN_PACK_POLICY = {
  enabledOverrides: Object.fromEntries(
    BUILTIN_NODE_PACKS.map((pack) => [pack.id, false])
  )
};

export async function buildFullRegistry(): Promise<NodeRegistry> {
  installSandboxCatalog();
  const registry = new NodeRegistry();
  await registerAvailablePacks(registry, CLI_BUILTIN_PACK_POLICY);
  return registry;
}
