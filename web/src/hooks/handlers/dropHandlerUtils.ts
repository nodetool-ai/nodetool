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
import { Graph, Workflow } from "../../stores/ApiTypes";
import log from "loglevel";
import { shallow } from "zustand/shallow";

export type FileHandlerResult = {
  success: boolean;
  data?: Asset | Workflow | null;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isNodetoolWorkflowJson = (
  json: unknown
): json is { name?: string; graph: Graph } => {
  if (!isRecord(json) || !isRecord(json.graph)) {
    return false;
  }

  return Array.isArray(json.graph.nodes) && Array.isArray(json.graph.edges);
};

export const useFileHandlers = () => {
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const { uploadAsset } = useAssetUpload();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const { createNode, addNode, workflow } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode,
    workflow: state.workflow
  }), shallow);
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
            const assetType = contentTypeToNodeType(
              uploadedAsset.content_type,
              uploadedAsset.name || file.name
            );
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
      return await handleGenericFile(file, position);
    },
    [handleGenericFile]
  );

  const handleJsonFile = useCallback(
    async (file: File, position: XYPosition): Promise<FileHandlerResult> => {
      try {
        log.info("[drop/json] Reading JSON file", { name: file.name });
        const jsonContent = await file.text();
        const jsonData = JSON.parse(jsonContent) as unknown;
        if (isNodetoolWorkflowJson(jsonData)) {
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
