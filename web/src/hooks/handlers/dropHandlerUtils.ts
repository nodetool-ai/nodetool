import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useCreateDataframe } from "./useCreateDataframe";
import {
  constantForType,
  contentTypeToNodeType
} from "../../utils/NodeTypeMapping";
import { useNotificationStore } from "../../stores/NotificationStore";
import useAuth from "../../stores/useAuth";
import { Asset } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import { createErrorMessage, AppError } from "../../utils/errorHandling";

export type FileHandlerResult = {
  success: boolean;
  data?: any;
  error?: string;
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
            } catch {
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
  return json.graph;
};

export const useFileHandlers = () => {
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const { createNode, addNode, workflow } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode,
    workflow: state.workflow
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { user } = useAuth((auth) => ({ user: auth.user }));
  const createDataframe = useCreateDataframe(createNode, addNode);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const navigate = useNavigate();

  const handleGenericFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        await uploadAsset({
          file,
          workflow_id: workflow.id,
          parent_id: currentFolderId || user?.id,
          onCompleted: (uploadedAsset: Asset) => {
            const assetType = contentTypeToNodeType(uploadedAsset.content_type);
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
      } catch (error) {
        const err = createErrorMessage(error, "Failed to upload file as asset");
        return {
          success: false,
          error: err instanceof AppError ? err.detail : err.message
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
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            const err = createErrorMessage(error, "Failed to create workflow");
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
            };
          }
        } else {
          return await handleGenericFile(file, position);
        }
      } catch (error) {
        const err = createErrorMessage(error, "Failed to process PNG file");
        return {
          success: false,
          error: err instanceof AppError ? err.detail : err.message
        };
      }
    },
    [createWorkflow, handleGenericFile, navigate]
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
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            const err = createErrorMessage(error, "Failed to create workflow");
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
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
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            const err = createErrorMessage(error, "Failed to create workflow");
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
            };
          }
        } else {
          // Handle as regular JSON file
          return await handleGenericFile(file, position);
        }
      } catch (error) {
        const err = createErrorMessage(error, "Failed to process JSON file");
        return {
          success: false,
          error: err instanceof AppError ? err.detail : err.message
        };
      }
    },
    [createWorkflow, handleGenericFile, navigate]
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
      } catch (error) {
        const err = createErrorMessage(error, "Failed to process CSV file");
        return {
          success: false,
          error: err instanceof AppError ? err.detail : err.message
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
