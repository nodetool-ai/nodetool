import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useFileHandlers } from "./dropHandlerUtils";
import useAuth from "../../stores/useAuth";
import { useAddNodeFromAsset } from "./addNodeFromAsset";
import { FileHandlerResult } from "./dropHandlerUtils";
import { useWorkflowStore } from "../../stores/WorkflowStore"; // Add this import

// File type detection
function detectFileType(file: File): string {
  switch (file.type) {
    case "image/png":
      return "png";
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    default:
      return "unknown";
  }
}

export const useDropHandler = () => {
  const { handlePngFile, handleJsonFile, handleCsvFile, handleGenericFile } =
    useFileHandlers();
  const reactFlow = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
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
      // const assetJSON = event.dataTransfer.getData("asset");
      // const asset = assetJSON ? (JSON.parse(assetJSON) as Asset) : null;
      // if (targetIsPane && asset !== null) {
      //   try {
      //     getAsset(asset.id).then((asset: Asset) => {
      //       addNodeFromAsset(asset, position);
      //     });
      //   } catch (error) {
      //     addNotification({
      //       type: "error",
      //       content: "Failed to get asset.",
      //       alert: true
      //     });
      //   }
      //   return;
      // }

      // Create nodes on file drop
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0 && user) {
        for (const file of files) {
          const fileType = detectFileType(file);
          let result: FileHandlerResult;

          switch (fileType) {
            case "png":
              console.log("3333 Handling PNG file");
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
            console.log("1111 File handling successful:", result);
            if (result.data && "id" in result.data) {
              console.log("2222 Adding node from asset:", result.data);
              addNodeFromAsset(result.data, position);
            }
          } else {
            console.error("File handling failed:", result.error);
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

  return { onDrop };
};

export default useDropHandler;

/* import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useCreateWorkflowFromFiles } from "./useCreateWorkflowFromFiles";
import { useCreateDataframe } from "./useCreateDataframe";
import { useAddNodeFromAsset } from "./addNodeFromAsset";
import { useMetadata } from "../../serverState/useMetadata";

interface DropHandler {
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const useDropHandler = (): DropHandler => {
  const reactFlow = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const workflow = useNodeStore((state) => state.workflow);
  const getAsset = useAssetStore((state) => state.get);
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const { user } = useAuth();
  const { data: metadata } = useMetadata();
  const tryCreateWorkflow = useCreateWorkflowFromFiles();
  const tryCreateDataframe = useCreateDataframe(createNode, addNode, metadata);

  const addNodeFromAsset = useAddNodeFromAsset();

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
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
      const files = Array.from(event.dataTransfer?.files);
      if (files.length > 0 && user) {
        tryCreateWorkflow(files).then((nonWorkflowFiles) => {
          const assetNodeFiles = tryCreateDataframe(nonWorkflowFiles, position);
          assetNodeFiles.forEach((file: File, index: number) => {
            uploadAsset({
              file,
              workflow_id: workflow.id,
              parent_id: currentFolderId || user.id,
              onCompleted: (asset: Asset) => {
                if (targetIsPane) {
                  addNodeFromAsset(asset, {
                    x: position.x + index * 300,
                    y: position.y
                  });
                }
              }
            });
          });
        });
      }
    },
    [
      reactFlow,
      createNode,
      addNode,
      getAsset,
      addNodeFromAsset,
      tryCreateWorkflow,
      tryCreateDataframe,
      workflow.id,
      currentFolderId,
      user,
      uploadAsset
    ]
  );

  return { onDrop };
};

export default useDropHandler;
 */
