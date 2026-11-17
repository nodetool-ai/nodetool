import {
  CLOUD_BUILTIN_PACK_IDS,
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudNodeType,
  isCloudProfileActive,
  resolveBuiltinPackEnabled,
  type BuiltinNodePack
} from "@nodetool-ai/protocol";
import type { NodeRegistry } from "./registry.js";

export interface BuiltinPackPolicy {
  includeOptionalPacks?: boolean;
  excludedPackIds?: readonly string[];
  enabledOverrides?: Readonly<Record<string, boolean>>;
  production?: boolean;
  cloudProfile?: boolean;
}

/** Explain why a host policy disables a bundled pack. */
export function builtinPackUnavailableReason(
  pack: BuiltinNodePack,
  policy: BuiltinPackPolicy
): string | undefined {
  const override = policy.cloudProfile
    ? CLOUD_BUILTIN_PACK_IDS.includes(pack.id)
    : (policy.enabledOverrides?.[pack.id] ??
      (policy.includeOptionalPacks ? true : undefined));
  if (
    (!pack.required && policy.excludedPackIds?.includes(pack.id)) ||
    !resolveBuiltinPackEnabled(pack, override)
  ) {
    return "disabled by built-in pack configuration";
  }
  if (policy.production && pack.id === "transformers-js") {
    return "unavailable in production";
  }
  return undefined;
}

export function applyBuiltinNodePolicy(
  registry: NodeRegistry,
  policy: Pick<BuiltinPackPolicy, "production" | "cloudProfile">,
  onRemoved?: (nodeType: string) => void
): void {
  const nodeTypes = new Set([
    ...registry.list(),
    ...registry.listMetadata().map((node) => node.node_type)
  ]);
  for (const nodeType of nodeTypes) {
    if (!isBuiltinNodeAdmitted(nodeType, policy)) {
      registry.unregister(nodeType);
      onRemoved?.(nodeType);
    }
  }
}

/** Node type prefixes a production server never runs. */
const PRODUCTION_DROPPED_NODE_PREFIXES: readonly string[] = [
  "transformers.",
  "vector."
];

/**
 * Whether a host with this policy runs `nodeType`. The single rule behind
 * {@link applyBuiltinNodePolicy}, exported so a path that resolves a node type
 * without that pruned registry (a node call from sandboxed code) refuses the
 * same types.
 */
export function isBuiltinNodeAdmitted(
  nodeType: string,
  policy: Pick<BuiltinPackPolicy, "production" | "cloudProfile">
): boolean {
  if (
    policy.production &&
    PRODUCTION_DROPPED_NODE_PREFIXES.some((prefix) => nodeType.startsWith(prefix))
  ) {
    return false;
  }
  return !(policy.cloudProfile && !isCloudNodeType(nodeType));
}

function processEnv(): Readonly<Record<string, string | undefined>> {
  return typeof process === "undefined" ? {} : process.env;
}

/** The production and cloud-profile switches this process runs under. */
export function builtinNodePolicyFromEnv(
  env: Readonly<Record<string, string | undefined>> = processEnv()
): Pick<BuiltinPackPolicy, "production" | "cloudProfile"> {
  return {
    production: env[NODE_ENV_VAR] === "production",
    cloudProfile: isCloudProfileActive(env[CLOUD_PROFILE_ENV], env[NODE_ENV_VAR])
  };
}
