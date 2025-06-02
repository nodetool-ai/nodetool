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

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const targetIsPane =
        target.classList.contains("react-flow__pane") ||
        target.classList.contains("loop-node");
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      // Create nodes from node menu drop
      const nodeJSON = event.dataTransfer.getData("create-node");
      const node = nodeJSON ? (JSON.parse(nodeJSON) as NodeMetadata) : null;
      if (node !== null) {
        const newNode = createNode(node, position);
        addNode(newNode);
        return;
      }

      // Create nodes on asset drop
      const assetJSON = event.dataTransfer.getData("asset");
      const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;
      if (targetIsPane && asset !== null) {
        getAsset(asset.id).then((asset: Asset) => {
          addNodeFromAsset(asset, position);
        });
      }

      // Create nodes on file drop
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0 && user) {
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
