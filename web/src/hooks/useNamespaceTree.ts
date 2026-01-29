import { useCallback, useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import { isProduction } from "../stores/ApiClient";
import { useSecrets } from "./useSecrets";

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

  // Get the required API key name for a namespace
  const getRequiredKey = useCallback((namespace: string) => {
    const apiKeyNames: Record<string, string> = {
      openai: "OpenAI API Key",
      hunyuan3d: "Hunyuan3D API Key",
      aime: "Aime API Key",
      anthropic: "Anthropic API Key",
      meshy: "Meshy API Key",
      point_e: "Point-E API Key",
      "point-e": "Point-E API Key",
      replicate: "Replicate API Token",
      rodin: "Rodin API Key",
      shap_e: "Shap-E API Key",
      "shap-e": "Shap-E API Key",
      trellis: "Trellis API Key",
      tripo: "Tripo API Key"
    };

    const rootNamespace = namespace.split(".")[0];
    return apiKeyNames[rootNamespace];
  }, []);

  // Check if a namespace should be disabled
  const isNamespaceDisabled = useCallback(
    (namespace: string) => {
      if (isProduction) {return false;}

      const apiKeyChecks: Record<string, () => boolean> = {
        calendly: () => !isApiKeySet("CALENDLY_API_TOKEN"),
        google: () => !isApiKeySet("GEMINI_API_KEY"),
        hunyuan3d: () => !isApiKeySet("HUNYUAN3D_API_KEY"),
        openai: () => !isApiKeySet("OPENAI_API_KEY"),
        aime: () => !isApiKeySet("AIME_API_KEY"),
        anthropic: () => !isApiKeySet("ANTHROPIC_API_KEY"),
        meshy: () => !isApiKeySet("MESHY_API_KEY"),
        point_e: () => !isApiKeySet("POINT_E_API_KEY"),
        "point-e": () => !isApiKeySet("POINT_E_API_KEY"),
        replicate: () => !isApiKeySet("REPLICATE_API_TOKEN"),
        rodin: () => !isApiKeySet("RODIN_API_KEY"),
        shap_e: () => !isApiKeySet("SHAP_E_API_KEY"),
        "shap-e": () => !isApiKeySet("SHAP_E_API_KEY"),
        trellis: () => !isApiKeySet("TRELLIS_API_KEY"),
        tripo: () => !isApiKeySet("TRIPO_API_KEY")
      };

      // Get the root namespace
      const rootNamespace = namespace.split(".")[0];

      // Check if this root namespace requires an API key
      for (const [prefix, check] of Object.entries(apiKeyChecks)) {
        if (rootNamespace === prefix) {return check();}
      }

      return false;
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
      const requiredKey = isDisabled ? getRequiredKey(namespace) : undefined;

      // Mark first disabled root namespace
      if (isDisabled && !foundFirstDisabled) {
        foundFirstDisabled = true;
        if (!tree[rootNamespace]) {
          tree[rootNamespace] = {
            children: {} as NamespaceTree,
            disabled: true,
            firstDisabled: true,
            requiredKey
          };
        } else {
          tree[rootNamespace].firstDisabled = true;
          tree[rootNamespace].disabled = true;
          tree[rootNamespace].requiredKey = requiredKey;
        }
      }

      // Build path in tree
      let current = tree;
      parts.forEach((part) => {
        if (!current[part]) {
          const newNode = {
            children: {} as NamespaceTree,
            disabled: isDisabled,
            requiredKey
          };
          current[part] = newNode;
        }
        if (isDisabled) {
          current[part].disabled = true;
          current[part].requiredKey = requiredKey;
        }
        current = current[part].children;
      });
    };

    uniqueNamespaces.forEach(addNamespaceToTree);
    return tree;
  }, [uniqueNamespaces, isNamespaceDisabled, getRequiredKey]);
};

export default useNamespaceTree;
