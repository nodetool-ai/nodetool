/**
 * Provider packs — API-key-driven node availability.
 *
 * NodeTool treats the API key as the source of truth for provider nodes:
 *  - a provider namespace is shown in the node menu only when its key is set
 *    (see useNamespaceTree),
 *  - setting a key enables the matching builtin pack so its nodes register, and
 *  - opening a workflow that uses a disabled pack enables that pack
 *    (see useAutoEnableNodePacks).
 *
 * These helpers bridge the builtin-pack catalog (which pack owns which
 * namespaces) and the namespace→secret mapping (which key a namespace needs).
 */
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";

import {
  getProviderKindForNamespace,
  getRequiredSecretKeyForNamespace
} from "./nodeProvider";

/**
 * True when a namespace's nodes only make sense once an API key is configured —
 * an API-backed provider with a dedicated key. Locally-run namespaces
 * (HuggingFace, Transformers.js) and keyless API namespaces (messaging) are not
 * gated.
 */
export const isNamespaceKeyGated = (namespace: string): boolean =>
  getProviderKindForNamespace(namespace) === "api" &&
  getRequiredSecretKeyForNamespace(namespace) !== null;

/** The secret key that gates a namespace, or null when it isn't key-gated. */
export const getKeyGateForNamespace = (namespace: string): string | null =>
  isNamespaceKeyGated(namespace)
    ? getRequiredSecretKeyForNamespace(namespace)
    : null;

const PACK_NAMESPACES = new Map<string, readonly string[]>(
  BUILTIN_NODE_PACKS.map((pack) => [pack.id, pack.namespaces])
);

/**
 * The API key a builtin provider pack needs, or null for packs that run locally
 * / need no key (e.g. Transformers.js, HuggingFace). Setting this key is what
 * makes the pack's nodes available — the key is the switch.
 */
export const getRequiredKeyForBuiltinPack = (
  packId: string
): string | null => {
  const namespaces = PACK_NAMESPACES.get(packId) ?? [];
  for (const namespace of namespaces) {
    const key = getKeyGateForNamespace(namespace);
    if (key) return key;
  }
  return null;
};
