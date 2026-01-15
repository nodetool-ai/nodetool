import { useCallback, useEffect } from "react";
import { useFavoriteNodesStore } from "../stores/FavoriteNodesStore";
import useMetadataStore from "../stores/MetadataStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { useCreateNode } from "./useCreateNode";
import { useStoreWithEqualityFn } from "zustand/traditional";
import useNodeMenuStore from "../stores/NodeMenuStore";
import isEqual from "lodash/isEqual";

interface UseFavoriteNodesShortcutsProps {
  enabled?: boolean;
}

export const useFavoriteNodesShortcuts = ({
  enabled = true
}: UseFavoriteNodesShortcutsProps = {}) => {
  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const menuPosition = useStoreWithEqualityFn(
    useNodeMenuStore,
    (state) => state.menuPosition,
    isEqual
  );

  const handleCreateNode = useCreateNode({
    x: menuPosition.x,
    y: menuPosition.y
  });

  const handleAddFavorite = useCallback(
    (index: number) => {
      if (index < 0 || index >= favorites.length) {
        return;
      }

      const favorite = favorites[index];
      if (!favorite) {
        return;
      }

      const { nodeType } = favorite;
      const metadata = getMetadata(nodeType);

      if (!metadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for node.`,
          timeout: 4000
        });
        return;
      }

      handleCreateNode(metadata);
    },
    [favorites, getMetadata, handleCreateNode, addNotification]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const key = event.key;
        const numberMatch = key.match(/^[1-9]$/);
        if (numberMatch) {
          event.preventDefault();
          const index = parseInt(numberMatch[0], 10) - 1;
          handleAddFavorite(index);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, favorites, handleAddFavorite]);

  return {
    favorites,
    handleAddFavorite
  };
};

export default useFavoriteNodesShortcuts;
