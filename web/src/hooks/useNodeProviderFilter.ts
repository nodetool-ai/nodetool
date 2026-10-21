import { useCallback, useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import { useSettingsStore } from "../stores/SettingsStore";
import type { NodeMetadata } from "../stores/ApiTypes";
import { namespaceNeedsMissingKey } from "../utils/providerPacks";
import { useSecrets } from "./useSecrets";

export interface NodeProviderFilter {
  /** True when the node's provider needs an API key that is not set. */
  needsMissingKey: (node: NodeMetadata) => boolean;
  /** Listed nodes that need a missing key, whether shown or hidden. */
  missingKeyCount: number;
  /** The user chose to see nodes that need a missing key. */
  showNodesWithoutKey: boolean;
  setShowNodesWithoutKey: (show: boolean) => void;
}

/**
 * Which nodes the node menu, its search and the node library offer. Nodes of a
 * provider whose API key is not set stay out of every list until the user
 * turns on `showNodesWithoutKey`, so a fresh install lists what can run.
 */
export const useNodeProviderFilter = (): NodeProviderFilter => {
  const { isApiKeySet } = useSecrets();
  const metadata = useMetadataStore((state) => state.metadata);
  const showNodesWithoutKey = useSettingsStore(
    (state) => state.settings.showNodesWithoutKey
  );
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const needsMissingKey = useCallback(
    (node: NodeMetadata) => namespaceNeedsMissingKey(node.namespace, isApiKeySet),
    [isApiKeySet]
  );

  const missingKeyCount = useMemo(() => {
    let count = 0;
    for (const node of Object.values(metadata)) {
      if (!node.hidden && needsMissingKey(node)) {
        count++;
      }
    }
    return count;
  }, [metadata, needsMissingKey]);

  const setShowNodesWithoutKey = useCallback(
    (show: boolean) => updateSettings({ showNodesWithoutKey: show }),
    [updateSettings]
  );

  return {
    needsMissingKey,
    missingKeyCount,
    showNodesWithoutKey,
    setShowNodesWithoutKey
  };
};
