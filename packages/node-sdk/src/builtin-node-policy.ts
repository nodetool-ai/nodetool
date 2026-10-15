import { isCloudNodeType } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "./registry.js";

export interface BuiltinPackPolicy {
  includeOptionalPacks?: boolean;
  excludedPackIds?: readonly string[];
  enabledOverrides?: Readonly<Record<string, boolean>>;
  production?: boolean;
  cloudProfile?: boolean;
}

export function applyBuiltinNodePolicy(
  registry: NodeRegistry,
  policy: Pick<BuiltinPackPolicy, "production" | "cloudProfile">,
  onRemoved?: (nodeType: string) => void
): void {
  for (const nodeType of registry.list()) {
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
