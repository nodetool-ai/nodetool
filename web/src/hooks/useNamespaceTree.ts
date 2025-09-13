import { useCallback, useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";
import { isProduction } from "../stores/ApiClient";

export interface NamespaceTree {
  [key: string]: {
    children: NamespaceTree;
    disabled: boolean;
    firstDisabled?: boolean;
    requiredKey?: string;
  };
}

const useNamespaceTree = (): NamespaceTree => {
  const metadata = useMetadataStore((state) => state.metadata);
  const secrets = useRemoteSettingsStore((state) => state.secrets);

  // Check if an API key is set
  const isApiKeySet = useCallback(
    (key: keyof typeof secrets) => {
      const value = secrets?.[key];
      if (!value) return false;
      return value.trim().length > 0;
    },
    [secrets]
  );

  // Get the required API key name for a namespace
  const getRequiredKey = useCallback((namespace: string) => {
    const apiKeyNames: Record<string, string> = {
      openai: "OpenAI API Key",
      aime: "Aime API Key",
      anthropic: "Anthropic API Key",
      replicate: "Replicate API Token"
    };

    const rootNamespace = namespace.split(".")[0];
    return apiKeyNames[rootNamespace];
  }, []);

  // Check if a namespace should be disabled
  const isNamespaceDisabled = useCallback(
    (namespace: string) => {
      if (isProduction) return false;

      const apiKeyChecks: Record<string, () => boolean> = {
        calendly: () => !isApiKeySet("CALENDLY_API_TOKEN"),
        google: () => !isApiKeySet("GEMINI_API_KEY"),
        openai: () => !isApiKeySet("OPENAI_API_KEY"),
        aime: () => !isApiKeySet("AIME_API_KEY"),
        anthropic: () => !isApiKeySet("ANTHROPIC_API_KEY"),
        replicate: () => !isApiKeySet("REPLICATE_API_TOKEN")
      };

      // Get the root namespace
      const rootNamespace = namespace.split(".")[0];

      // Check if this root namespace requires an API key
      for (const [prefix, check] of Object.entries(apiKeyChecks)) {
        if (rootNamespace === prefix) return check();
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
      parts.forEach((part, index) => {
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
