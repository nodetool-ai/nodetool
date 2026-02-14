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
import {
  comfyWorkflowToNodeToolGraph,
  comfyPromptToNodeToolGraph,
  COMFY_WORKFLOW_FLAG
} from "../../utils/comfyWorkflowConverter";
import { ComfyUIWorkflow, ComfyUIPrompt } from "../../services/ComfyUIService";
import { Graph, Workflow } from "../../stores/ApiTypes";
import log from "loglevel";

export type FileHandlerResult = {
  success: boolean;
  data?: Asset | Workflow | null;
  error?: string;
};

export const extractWorkflowFromPng = async (
  file: File
): Promise<ComfyUIWorkflow | null> => {
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
              const workflow = JSON.parse(textContent) as ComfyUIWorkflow;
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isComfyWorkflowJson = (
  json: unknown
): json is ComfyUIWorkflow => {
  if (!isRecord(json)) {
    return false;
  }

  const hasLastNodeId = typeof json.last_node_id === "number";
  const hasLastLinkId = typeof json.last_link_id === "number";
  const hasNodes = Array.isArray(json.nodes);
  const hasLinks = Array.isArray(json.links);

  return hasLastNodeId && hasLastLinkId && hasNodes && hasLinks;
};

export const isNodetoolWorkflowJson = (
  json: unknown
): json is { name?: string; graph: Graph } => {
  if (!isRecord(json) || !isRecord(json.graph)) {
    return false;
  }

  return Array.isArray(json.graph.nodes) && Array.isArray(json.graph.edges);
};

export const isComfyPromptJson = (json: unknown): json is ComfyUIPrompt => {
  if (!isRecord(json) || Array.isArray(json)) {
    return false;
  }

  const entries = Object.entries(json);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, value]) => {
    if (!/^\d+$/.test(key) || !isRecord(value)) {
      return false;
    }

    return (
      typeof value.class_type === "string" &&
      isRecord(value.inputs)
    );
  });
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
            const graph = comfyWorkflowToNodeToolGraph(workflow);
            const createdWorkflow = await createWorkflow({
              name: file.name,
              description: "created from comfy",
              access: "private",
              graph,
              settings: {
                [COMFY_WORKFLOW_FLAG]: true
              }
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
        log.info("[drop/json] Reading JSON file", { name: file.name });
        const jsonContent = await file.text();
        const jsonData = JSON.parse(jsonContent) as unknown;
        if (isComfyWorkflowJson(jsonData)) {
          log.info("[drop/json] Detected ComfyUI workflow JSON", {
            name: file.name
          });
          try {
            const graph = comfyWorkflowToNodeToolGraph(jsonData);
            const createdWorkflow = await createWorkflow({
              name: file.name,
              description: "created from comfy",
              access: "private",
              graph,
              settings: {
                [COMFY_WORKFLOW_FLAG]: true
              }
            });
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            log.error("[drop/json] Failed creating workflow from Comfy JSON", {
              name: file.name,
              error
            });
            const err = createErrorMessage(error, "Failed to create workflow");
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
            };
          }
        } else if (isNodetoolWorkflowJson(jsonData)) {
          log.info("[drop/json] Detected NodeTool workflow JSON", {
            name: file.name
          });
          try {
            const createdWorkflow = await createWorkflow({
              name: jsonData.name || file.name,
              description: "created from json",
              access: "private",
              graph: jsonData.graph
            });
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            log.error("[drop/json] Failed creating workflow from NodeTool JSON", {
              name: file.name,
              error
            });
            const err = createErrorMessage(error, "Failed to create workflow");
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
            };
          }
        } else if (isComfyPromptJson(jsonData)) {
          log.info("[drop/json] Detected ComfyUI prompt JSON (API format)", {
            name: file.name
          });
          try {
            const graph = comfyPromptToNodeToolGraph(jsonData);
            const createdWorkflow = await createWorkflow({
              name: file.name,
              description: "created from comfy prompt json",
              access: "private",
              graph,
              settings: {
                [COMFY_WORKFLOW_FLAG]: true
              }
            });
            navigate(`/editor/${createdWorkflow.id}`);
            return { success: true, data: createdWorkflow };
          } catch (error) {
            log.error("[drop/json] Failed creating workflow from Comfy prompt JSON", {
              name: file.name,
              error
            });
            const err = createErrorMessage(
              error,
              "Failed to create workflow from Comfy prompt"
            );
            return {
              success: false,
              error: err instanceof AppError ? err.detail : err.message
            };
          }
        } else {
          log.info("[drop/json] JSON not recognized as workflow, uploading as asset", {
            name: file.name
          });
          // Handle as regular JSON file
          return await handleGenericFile(file, position);
        }
      } catch (error) {
        log.error("[drop/json] Failed to parse/process JSON file", {
          name: file.name,
          error
        });
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
