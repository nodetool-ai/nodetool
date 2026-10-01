/**
 * Builds a NodeRegistry populated with every TypeScript node pack the CLI
 * ships. Shared by the debug, validate, and single-node-run harnesses so they
 * all resolve node types against the same set.
 *
 * Python-only node packs (huggingface worker nodes, mlx, etc.) are not
 * registered here — they have no TS class and are resolved lazily through the
 * Python bridge at execution time. Static tools (validate) therefore treat
 * unknown types as "not in the local TS registry".
 */
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  registerBuiltinPacks,
  CLI_BUILTIN_PACK_POLICY
} from "@nodetool-ai/base-nodes/builtin-packs";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { installSandboxCatalog } from "./sandbox-catalog.js";

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

export function buildFullRegistry(): NodeRegistry {
  installSandboxCatalog();
  const registry = new NodeRegistry();
  registerBuiltinPacks(registry, CLI_BUILTIN_PACK_POLICY);
  return registry;
}
