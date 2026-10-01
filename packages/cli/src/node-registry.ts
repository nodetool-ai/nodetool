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
import { installSandboxCatalog } from "./sandbox-catalog.js";

export function buildFullRegistry(): NodeRegistry {
  installSandboxCatalog();
  const registry = new NodeRegistry();
  registerBuiltinPacks(registry, CLI_BUILTIN_PACK_POLICY);
  return registry;
}
