import { registerBaseNodes } from "./index.js";
import { registerElevenLabsNodes } from "@nodetool-ai/elevenlabs-nodes";
import { registerMinimaxNodes } from "@nodetool-ai/minimax-nodes";
import { registerTransformersJsNodes } from "@nodetool-ai/transformers-js-nodes";
import { registerFalNodes } from "@nodetool-ai/fal-nodes";
import { registerKieNodes } from "@nodetool-ai/kie-nodes";
import { registerTopazNodes } from "@nodetool-ai/topaz-nodes";
import { registerReveNodes } from "@nodetool-ai/reve-nodes";
import { registerAtlasCloudNodes } from "@nodetool-ai/atlascloud-nodes";
import { registerHiggsfieldNodes } from "@nodetool-ai/higgsfield-nodes";
import { registerTogetherNodes } from "@nodetool-ai/together-nodes";
import { registerReplicateNodes } from "@nodetool-ai/replicate-nodes";
import { registerHuggingFaceNodes } from "@nodetool-ai/huggingface-nodes";

import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  BUILTIN_NODE_PACKS,
  resolveBuiltinPackEnabled,
  CLOUD_BUILTIN_PACK_IDS,
  isCloudNodeType,
  type BuiltinNodePack
} from "@nodetool-ai/protocol";

export interface BuiltinPackPolicy {
  includeOptionalPacks?: boolean;
  excludedPackIds?: readonly string[];
  enabledOverrides?: Readonly<Record<string, boolean>>;
  production?: boolean;
  cloudProfile?: boolean;
}

/** CLI harnesses historically expose these packs independently of user toggles. */
export const CLI_BUILTIN_PACK_POLICY: BuiltinPackPolicy = {
  includeOptionalPacks: true,
  excludedPackIds: ["kie", "topaz", "higgsfield", "together"]
};

const BUILTIN_PACK_REGISTRARS: Record<
  string,
  (registry: NodeRegistry) => void
> = {
  base: registerBaseNodes,
  elevenlabs: registerElevenLabsNodes,
  minimax: registerMinimaxNodes,
  "transformers-js": registerTransformersJsNodes,
  fal: registerFalNodes,
  kie: registerKieNodes,
  topaz: registerTopazNodes,
  reve: registerReveNodes,
  atlascloud: registerAtlasCloudNodes,
  higgsfield: registerHiggsfieldNodes,
  together: registerTogetherNodes,
  replicate: registerReplicateNodes,
  huggingface: registerHuggingFaceNodes
};

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

/** Register classes first. Hosts apply applyBuiltinNodePolicy after loading metadata and third-party packs. */
export function registerBuiltinPacks(
  registry: NodeRegistry,
  policy: BuiltinPackPolicy = {},
  onSkipped?: (pack: BuiltinNodePack, reason: string) => void
): void {
  for (const pack of BUILTIN_NODE_PACKS) {
    const registrar = BUILTIN_PACK_REGISTRARS[pack.id];
    if (!registrar) {
      throw new Error(`No registrar for built-in node pack "${pack.id}"`);
    }
    const reason = builtinPackUnavailableReason(pack, policy);
    if (reason) {
      onSkipped?.(pack, reason);
    } else {
      registry.registerPackage(pack.id, registrar);
    }
  }
}

export function setBuiltinPackEnabled(
  registry: NodeRegistry,
  id: string,
  enabled: boolean
): void {
  const registrar = BUILTIN_PACK_REGISTRARS[id];
  if (!registrar) {
    throw new Error(`No registrar for built-in node pack "${id}"`);
  }
  if (enabled) {
    registry.registerPackage(id, registrar);
  } else {
    for (const nodeType of registry.list()) {
      if (registry.getNodePackageId(nodeType) === id) {
        registry.unregister(nodeType);
      }
    }
  }
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
