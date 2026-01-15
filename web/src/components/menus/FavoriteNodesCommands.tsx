import { memo, useCallback, useMemo } from "react";
import { Command } from "cmdk";
import { Tooltip } from "@mui/material";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import NodeInfo from "../node_menu/NodeInfo";
import { useCommandMenu } from "./CommandMenu";

const FavoriteNodesCommands = memo(function FavoriteNodesCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const reactFlowWrapper = useCommandMenu((state) => state.reactFlowWrapper);

  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const { width: reactFlowWidth, height: reactFlowHeight } = useMemo(
    () =>
      reactFlowWrapper.current?.getBoundingClientRect() ?? {
        width: 800,
        height: 600
      },
    [reactFlowWrapper]
  );

  const handleCreateNode = useCreateNode({
    x: reactFlowWidth / 2,
    y: reactFlowHeight / 2
  });

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleAddFavorite = useCallback(
    (nodeType: string, displayName: string) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${displayName}.`,
          timeout: 4000
        });
        return;
      }
      handleCreateNode(metadata);
    },
    [getMetadata, handleCreateNode, addNotification]
  );

  if (favorites.length === 0) {
    return (
      <Command.Group heading="Favorites">
        <Command.Item disabled>No favorites yet</Command.Item>
      </Command.Group>
    );
  }

  return (
    <Command.Group heading="Favorites">
      {favorites.map((favorite, index) => {
        const { nodeType } = favorite;
        const metadata = getMetadata(nodeType);
        const displayName = metadata?.title || nodeType.split(".").pop() || nodeType;
        const shortcutNumber = index + 1;

        return (
          <Tooltip
            key={nodeType}
            title={
              metadata ? (
                <NodeInfo nodeMetadata={metadata} />
              ) : (
                <div>
                  <div>{displayName}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Node type: {nodeType}
                  </div>
                </div>
              )
            }
            placement="right"
            enterDelay={0}
            leaveDelay={0}
            TransitionProps={{ timeout: 0 }}
          >
            <Command.Item
              onSelect={() =>
                executeAndClose(() => handleAddFavorite(nodeType, displayName))
              }
            >
              <span>{displayName}</span>
              <span
                style={{
                  marginLeft: "auto",
                  opacity: 0.5,
                  fontSize: "0.8em"
                }}
              >
                Alt+{shortcutNumber}
              </span>
            </Command.Item>
          </Tooltip>
        );
      })}
    </Command.Group>
  );
});

export default FavoriteNodesCommands;
