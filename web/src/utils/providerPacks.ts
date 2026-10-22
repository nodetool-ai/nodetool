/**
 * Provider packs — API-key-driven node availability.
 *
 * NodeTool treats the API key as the source of truth for provider nodes:
 *  - a provider's nodes are offered in the node menu, its search and the node
 *    library only when its key is set, unless the user turns on
 *    "show nodes that need a key" (see useNodeProviderFilter),
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

/**
 * True when a namespace's nodes wait on an API key the user has not set. The
 * node menu, its search and the node library leave these nodes out unless the
 * user asks to see them.
 */
export const namespaceNeedsMissingKey = (
  namespace: string,
  isApiKeySet: (key: string) => boolean
): boolean => {
  const key = getKeyGateForNamespace(namespace);
  return key !== null && !isApiKeySet(key);
};

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
