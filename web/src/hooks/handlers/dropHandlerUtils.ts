import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import { TypeName } from "../../stores/ApiTypes";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useNodeStore } from "../../stores/NodeStore";
import { useCreateDataframe } from "./useCreateDataframe";
import { constantForType } from "./useConnectionHandlers";
import { useNotificationStore } from "../../stores/NotificationStore";
import useAuth from "../../stores/useAuth";
import { Asset } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";

export type FileHandlerResult = {
  success: boolean;
  data?: any;
  error?: string;
};

export const nodeTypeFor = (contentType: string): TypeName | null => {
  switch (contentType) {
    case "application/json":
    case "text/plain":
      return "text";
    case "text/csv":
      return "dataframe";
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return "image";
    case "video/mp4":
    case "video/mpeg":
    case "video/ogg":
    case "video/webm":
      return "video";
    case "audio/mpeg":
    case "audio/ogg":
    case "audio/wav":
    case "audio/webm":
    case "audio/mp3":
      return "audio";
    default:
      return null;
  }
};

export const extractWorkflowFromPng = async (
  file: File
): Promise<Record<string, never> | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (event: ProgressEvent<FileReader>) {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);

      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      let offset = pngSignature.length;

      while (offset < uint8Array.length) {
        const chunkLength =
          uint8Array[offset] * 16777216 +
          uint8Array[offset + 1] * 65536 +
          uint8Array[offset + 2] * 256 +
          uint8Array[offset + 3];
        offset += 4;

        const chunkType = String.fromCharCode(
          uint8Array[offset],
          uint8Array[offset + 1],
          uint8Array[offset + 2],
          uint8Array[offset + 3]
        );
        offset += 4;

        if (chunkType === "tEXt") {
          let keywordEnd = offset;
          while (
            uint8Array[keywordEnd] !== 0 &&
            keywordEnd < offset + chunkLength
          ) {
            keywordEnd++;
          }

          const keyword = String.fromCharCode(
            ...uint8Array.slice(offset, keywordEnd)
          );

          if (keyword === "workflow") {
            const textContent = new TextDecoder().decode(
              uint8Array.slice(keywordEnd + 1, offset + chunkLength)
            );
            try {
              const workflow = JSON.parse(textContent);
              resolve(workflow);
              return;
            } catch (error) {
              reject(new Error("Failed to parse workflow JSON"));
              return;
            }
          }
        }

        offset += chunkLength + 4; // Skip CRC
      }

      resolve(null); // No workflow found
    };

    reader.onerror = function () {
      reject(new Error("Error reading file"));
    };

    reader.readAsArrayBuffer(file);
  });
};

export const isComfyWorkflowJson = (json: any): boolean => {
  return json.last_node_id && json.last_link_id && json.nodes;
};

export const isNodetoolWorkflowJson = (json: any): boolean => {
  return json.graph && json.name && json.description;
};

export const useFileHandlers = () => {
  const workflow = useNodeStore((state) => state.workflow);
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const createWorkflow = useWorkflowStore((state) => state.create);
  const setWorkflow = useNodeStore((state) => state.setWorkflow);
  const { createNode, addNode } = useNodeStore();
  const { addNotification } = useNotificationStore();
  const { user } = useAuth();
  const createDataframe = useCreateDataframe(createNode, addNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const handleGenericFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        await uploadAsset({
          file,
          workflow_id: workflow.id,
          parent_id: currentFolderId || user?.id,
          onCompleted: (uploadedAsset: Asset) => {
            const assetType = nodeTypeFor(file.type);
            const nodeType = constantForType(assetType || "");

            if (nodeType === null) {
              addNotification({
                type: "warning",
                alert: true,
                content: "Unsupported file type: " + file.type
              });
              return;
            }

            const nodeMetadata = getMetadata(nodeType);
            if (!nodeMetadata) {
              throw new Error("No metadata for node type: " + nodeType);
            }
            const newNode = createNode(nodeMetadata, position);

            // Set the node's value to the uploaded asset
            newNode.data.properties.value = {
              type: assetType,
              uri: uploadedAsset.get_url,
              asset_id: uploadedAsset.id,
              temp_id: null
            };
            addNode(newNode);
          }
        });

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to upload file as asset"
        };
      }
    },
    [
      uploadAsset,
      workflow.id,
      currentFolderId,
      user?.id,
      getMetadata,
      createNode,
      addNode,
      addNotification
    ]
  );

  const handlePngFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        const workflow = await extractWorkflowFromPng(file);

        if (workflow) {
          try {
            const createdWorkflow = await createWorkflow({
              name: file.name,
              description: "created from comfy",
              access: "private",
              comfy_workflow: workflow
            });
            setWorkflow(createdWorkflow);
            return { success: true, data: createdWorkflow };
          } catch (error: any) {
            return {
              success: false,
              error: error.message || "Failed to create workflow"
            };
          }
        } else {
          return await handleGenericFile(file, position);
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to process PNG file"
        };
      }
    },
    [createWorkflow, setWorkflow, handleGenericFile]
  );

  const handleJsonFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        const jsonContent = await file.text();
        const jsonData = JSON.parse(jsonContent);
        if (isComfyWorkflowJson(jsonData)) {
          try {
            const createdWorkflow = await createWorkflow({
              name: file.name,
              description: "created from comfy",
              access: "private",
              comfy_workflow: jsonData
            });
            setWorkflow(createdWorkflow);
            return { success: true, data: createdWorkflow };
          } catch (error: any) {
            return {
              success: false,
              error: error.detail || "Failed to create workflow"
            };
          }
        } else if (isNodetoolWorkflowJson(jsonData)) {
          try {
            const createdWorkflow = await createWorkflow({
              name: jsonData.name,
              description: "created from json",
              access: "private",
              graph: jsonData.graph
            });
            setWorkflow(createdWorkflow);
            return { success: true, data: createdWorkflow };
          } catch (error: any) {
            return {
              success: false,
              error: error.message || "Failed to create workflow"
            };
          }
        } else {
          // Handle as regular JSON file
          return await handleGenericFile(file, position);
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to process JSON file"
        };
      }
    },
    [createWorkflow, setWorkflow, handleGenericFile]
  );

  const handleCsvFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        const remainingFiles = createDataframe([file], position);
        if (remainingFiles.length === 0) {
          return { success: true, data: null };
        } else {
          // If createDataframe didn't handle the file, treat it as a generic file
          return await handleGenericFile(file, position);
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to process CSV file"
        };
      }
    },
    [createDataframe, handleGenericFile]
  );

  return {
    handleGenericFile,
    handlePngFile,
    handleJsonFile,
    handleCsvFile,
    createDataframe
  };
};
