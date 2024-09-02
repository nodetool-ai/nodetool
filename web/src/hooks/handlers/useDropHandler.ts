import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { Asset, NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useComfyFileProcessor } from "./useComfyFileProcessor";
import { useFileEmbedder } from "./useFileEmbedder";
import { useAddNodeFromAsset } from "./addNodeFromAsset";
import { useMetadata } from "../../serverState/useMetadata";
/* import { useNotificationStore } from "../../stores/NotificationStore"; */

interface DropHandler {
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export const useDropHandler = (): DropHandler => {
  const reactFlow = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const workflow = useNodeStore((state) => state.workflow);
  const createWorkflow = useWorkflowStore((state) => state.create);
  const setWorkflow = useNodeStore((state) => state.setWorkflow);
  const getAsset = useAssetStore((state) => state.get);
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const { user } = useAuth();
  /*   const addNotification = useNotificationStore(
    (state) => state.addNotification
  ); */
  const { data: metadata } = useMetadata();
  const processComfyFiles = useComfyFileProcessor(createWorkflow, setWorkflow);
  const embedAssetsFromFiles = useFileEmbedder(createNode, addNode, metadata);

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
        processComfyFiles(files).then((nonComfyFiles) => {
          const nonEmbeddedFiles = embedAssetsFromFiles(
            nonComfyFiles,
            position
          );
          nonEmbeddedFiles.forEach((file: File, index: number) => {
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
      processComfyFiles,
      embedAssetsFromFiles,
      workflow.id,
      currentFolderId,
      user,
      uploadAsset
    ]
  );

  return { onDrop };
};

export default useDropHandler;
