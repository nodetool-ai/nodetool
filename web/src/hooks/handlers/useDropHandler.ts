import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useFileHandlers } from "./dropHandlerUtils";
import useAuth from "../../stores/useAuth";
import { useAddNodeFromAsset } from "./addNodeFromAsset";
import { FileHandlerResult } from "./dropHandlerUtils";
import { useNodes } from "../../contexts/NodeContext";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../lib/dragdrop";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";

// Node spacing when dropping multiple assets
const MULTI_NODE_HORIZONTAL_SPACING = 250;
const MULTI_NODE_VERTICAL_SPACING = 250;
const NODES_PER_ROW = 2;

// File type detection
function detectFileType(file: File): string {
  switch (file.type) {
    case "image/png":
      return "png";
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    case "application/pdf":
      return "document";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "document";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "document";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "document";
    default:
      return "unknown";
  }
}

export const useDropHandler = () => {
  const { handlePngFile, handleJsonFile, handleCsvFile, handleGenericFile } =
    useFileHandlers();
  const reactFlow = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const getAsset = useAssetStore((state) => state.get);
  const { user } = useAuth();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const addNodeFromAsset = useAddNodeFromAsset();
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const targetIsPane = target.classList.contains("react-flow__pane");
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      // Use unified deserialization
      const dragData = deserializeDragData(event.dataTransfer);

      // Handle create-node drop
      if (dragData?.type === "create-node") {
        const node = dragData.payload as NodeMetadata;
        const newNode = createNode(node, position);
        addNode(newNode);
        // Track this node as recently used
        addRecentNode(node.node_type);
        return;
      }

      // Handle asset drops on pane
      if (targetIsPane && dragData) {
        if (dragData.type === "assets-multiple") {
          const selectedAssetIds = dragData.payload as string[];
          // If multiple assets are selected, create nodes for all of them
          if (selectedAssetIds.length > 1) {
            selectedAssetIds.forEach((assetId, index) => {
              // Offset each node to avoid overlap
              const offsetX =
                (index % NODES_PER_ROW) * MULTI_NODE_HORIZONTAL_SPACING;
              const offsetY =
                Math.floor(index / NODES_PER_ROW) * MULTI_NODE_VERTICAL_SPACING;
              const nodePosition = {
                x: position.x + offsetX,
                y: position.y + offsetY
              };

              getAsset(assetId).then((asset: Asset) => {
                addNodeFromAsset(asset, nodePosition);
              });
            });
            return;
          } else if (selectedAssetIds.length === 1) {
            // Single asset from multiple selection
            getAsset(selectedAssetIds[0]).then((asset: Asset) => {
              addNodeFromAsset(asset, position);
            });
            return;
          }
        } else if (dragData.type === "asset") {
          const asset = dragData.payload as Asset;
          getAsset(asset.id).then((fetchedAsset: Asset) => {
            addNodeFromAsset(fetchedAsset, position);
          });
          return;
        }
      }

      // Handle external file drops
      if (hasExternalFiles(event.dataTransfer) && user) {
        const files = extractFiles(event.dataTransfer);
        for (const file of files) {
          const fileType = detectFileType(file);
          let result: FileHandlerResult;

          switch (fileType) {
            case "png":
              result = await handlePngFile(file, position);
              break;
            case "json":
              result = await handleJsonFile(file, position);
              break;
            case "csv":
              result = await handleCsvFile(file, position);
              break;
            default:
              result = await handleGenericFile(file, position);
          }

          if (result.success) {
            if (result.data && "id" in result.data) {
              addNodeFromAsset(result.data, position);
            }
          } else {
            addNotification({
              type: "error",
              content: `Failed to process file: ${result.error}`,
              alert: true
            });
          }
        }
      }
    },
    [
      reactFlow,
      user,
      createNode,
      addNode,
      getAsset,
      addNodeFromAsset,
      handlePngFile,
      handleJsonFile,
      handleCsvFile,
      handleGenericFile,
      addNotification
    ]
  );

  /* DRAG OVER */
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return { onDrop, onDragOver };
};

export default useDropHandler;
