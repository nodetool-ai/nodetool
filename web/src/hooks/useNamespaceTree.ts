import { useCallback, useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import { isProduction } from "../stores/ApiClient";
import { useSecrets } from "./useSecrets";
import {
  getProviderKindForNamespace,
  getRequiredSecretKeyForNamespace,
  getSecretDisplayName
} from "../utils/nodeProvider";

/**
 * Represents a hierarchical tree structure for organizing node namespaces.
 * Used to group and display nodes by their namespace (e.g., "openai.chat", "anthropic.completion").
 * 
 * @example
 * ```typescript
 * {
 *   "openai": {
 *     children: {
 *       "chat": { children: {}, disabled: false },
 *       "completion": { children: {}, disabled: false }
 *     },
 *     disabled: false
 *   },
 *   "anthropic": {
 *     children: {
 *       "completion": { children: {}, disabled: true, requiredKey: "Anthropic API Key" }
 *     },
 *     disabled: true,
 *     firstDisabled: true,
 *     requiredKey: "Anthropic API Key"
 *   }
 * }
 * ```
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
 * Hook that builds a hierarchical tree structure from all available node namespaces.
 * This tree is used to organize and display nodes in the node menu by category.
 * 
 * The hook handles:
 * - **Namespace Extraction**: Collects unique namespaces from node metadata
 * - **Tree Construction**: Builds a hierarchical structure from dot-separated namespaces
 * - **API Key Validation**: Marks namespaces as disabled when required API keys are missing
 * - **Sorting**: Sorts namespaces with enabled first, then disabled alphabetically
 * - **First Disabled Tracking**: Marks the first disabled root namespace for UI hints
 * 
 * @returns NamespaceTree hierarchical structure for node organization
 * 
 * @example
 * ```typescript
 * const namespaceTree = useNamespaceTree();
 * 
 * // Render namespace tree in node menu
 * Object.entries(namespaceTree).map(([name, node]) => (
 *   <NamespaceSection key={name} name={name} node={node} />
 * ));
 * ```
 * 
 * @example
 * **Namespace Structure**:
 * - Root namespaces: "openai", "anthropic", "huggingface"
 * - Nested namespaces: "openai.chat", "openai.embedding"
 * - Disabled when API key not set: "anthropic.*" → "Anthropic API Key required"
 * 
 * @see useMetadataStore - Source of node metadata with namespaces
 * @see useSecrets - Used to check API key availability
 */
const useNamespaceTree = (): NamespaceTree => {
  const metadata = useMetadataStore((state) => state.metadata);
  const { isApiKeySet } = useSecrets();

  // Check if a namespace should be disabled
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
  }, [metadata, isNamespaceDisabled]);

  // Build the tree structure
  return useMemo(() => {
    const tree: NamespaceTree = {};
    let foundFirstDisabled = false;

    // Helper function to add a namespace to the tree
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
