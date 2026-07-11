import { useCallback, useMemo } from "react";
import { isProduction } from "../lib/env";
import useMetadataStore from "../stores/MetadataStore";
import useOptionalNodePacksStore from "../stores/OptionalNodePacksStore";
import { useSecrets } from "./useSecrets";
import { isNamespaceHiddenByOptionalPacks } from "../config/optionalNodePacks";
import { getKeyGateForNamespace } from "../utils/providerPacks";
import {
  getProviderKindForNamespace,
  getRequiredSecretKeyForNamespace,
  getSecretDisplayName
} from "../utils/nodeProvider";

/**
 * Hierarchical tree of node namespaces (e.g. "openai.chat", "anthropic.completion"),
 * used to group and display nodes in the node menu by category.
 */
export interface NamespaceTree {
  [key: string]: {
    children: NamespaceTree;
    disabled: boolean;
    firstDisabled?: boolean;
    requiredKey?: string;
    providerKind: "api" | "local";
  };
}

/**
 * Builds a hierarchical namespace tree from node metadata. Namespaces from
 * optional packs the user hasn't enabled are excluded; key-gated provider
 * namespaces are hidden until their API key is set, and sorted enabled-first.
 */
const useNamespaceTree = (): NamespaceTree => {
  const metadata = useMetadataStore((state) => state.metadata);
  const enabledPackIds = useOptionalNodePacksStore(
    (state) => state.enabledPackIds
  );
  const { isApiKeySet } = useSecrets();

  // Namespaces belonging to optional packs the user hasn't turned on are kept
  // out of the browsable tree. Search and direct node usage are unaffected.
  const enabledPacks = useMemo(
    () => new Set(enabledPackIds),
    [enabledPackIds]
  );

  const isNamespaceDisabled = useCallback(
    (namespace: string) => {
      if (isProduction) {return false;}
      const requiredSecret = getRequiredSecretKeyForNamespace(namespace);
      if (!requiredSecret) {
        return false;
      }
      return !isApiKeySet(requiredSecret);
    },
    [isApiKeySet]
  );

  // Get unique namespaces and sort them (enabled first, then disabled)
  const uniqueNamespaces = useMemo(() => {
    const namespaces = Object.values(metadata)
      .map((node) => node.namespace)
      .filter((namespace) => namespace !== "default")
      .filter(
        (namespace) =>
          !isNamespaceHiddenByOptionalPacks(namespace, enabledPacks)
      )
      // API key is the source of truth for providers: hide a key-gated
      // namespace until its key is set. Locally-run packs are never gated.
      .filter((namespace) => {
        const requiredKey = getKeyGateForNamespace(namespace);
        return requiredKey === null || isApiKeySet(requiredKey);
      })
      .filter(
        (value, index, self) => index === self.findIndex((t) => t === value)
      );

    return namespaces.sort((a, b) => {
      const aDisabled = isNamespaceDisabled(a);
      const bDisabled = isNamespaceDisabled(b);
      if (aDisabled === bDisabled) {
        return a.localeCompare(b);
      }
      return aDisabled ? 1 : -1;
    });
  }, [metadata, isNamespaceDisabled, isApiKeySet, enabledPacks]);

  return useMemo(() => {
    const tree: NamespaceTree = {};
    let foundFirstDisabled = false;

    const addNamespaceToTree = (namespace: string) => {
      const parts = namespace.split(".");
      const rootNamespace = parts[0];
      const isDisabled = isNamespaceDisabled(namespace);
      const requiredSecret = getRequiredSecretKeyForNamespace(namespace);
      const requiredKey =
        isDisabled && requiredSecret
          ? getSecretDisplayName(requiredSecret)
          : undefined;
      const providerKind = getProviderKindForNamespace(namespace);

      // Mark first disabled root namespace
      if (isDisabled && !foundFirstDisabled) {
        foundFirstDisabled = true;
        if (!tree[rootNamespace]) {
          tree[rootNamespace] = {
            children: {} as NamespaceTree,
            disabled: true,
            firstDisabled: true,
            requiredKey,
            providerKind
          };
        } else {
          tree[rootNamespace].firstDisabled = true;
          tree[rootNamespace].disabled = true;
          tree[rootNamespace].requiredKey = requiredKey;
          tree[rootNamespace].providerKind = providerKind;
        }
      }

      // Build path in tree
      let current = tree;
      parts.forEach((part) => {
        if (!current[part]) {
          const newNode = {
            children: {} as NamespaceTree,
            disabled: isDisabled,
            requiredKey,
            providerKind
          };
          current[part] = newNode;
        }
        if (isDisabled) {
          current[part].disabled = true;
          current[part].requiredKey = requiredKey;
        }
        current[part].providerKind = providerKind;
        current = current[part].children;
      });
    };

    uniqueNamespaces.forEach(addNamespaceToTree);
    return tree;
  }, [uniqueNamespaces, isNamespaceDisabled]);
};

export default useNamespaceTree;
