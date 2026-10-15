import {
  CLOUD_BUILTIN_PACK_IDS,
  isCloudNodeType,
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
    if (
      (policy.production &&
        ["transformers.", "vector."].some((prefix) =>
          nodeType.startsWith(prefix)
        )) ||
      (policy.cloudProfile && !isCloudNodeType(nodeType))
    ) {
      registry.unregister(nodeType);
      onRemoved?.(nodeType);
    }
  }
}
