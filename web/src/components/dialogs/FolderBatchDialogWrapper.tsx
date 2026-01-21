/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState, useEffect, useRef } from "react";
import { useFolderBatchStore, BatchFile } from "../../stores/FolderBatchStore";
import { useNodes } from "../../contexts/NodeContext";
import FileBrowserDialog from "./FileBrowserDialog";
import FolderBatchDialog from "./FolderBatchDialog";
import { client } from "../../stores/ApiClient";
import { FileInfo } from "../../stores/ApiTypes";
import { contentTypeToNodeType } from "../../utils/NodeTypeMapping";
import { createErrorMessage } from "../../utils/errorHandling";
import { useNotificationStore } from "../../stores/NotificationStore";
import { findFileInputNodes, matchFileToInputNode } from "../../hooks/useFolderBatch";
import { NodeData } from "../../stores/NodeData";
import { Node, Edge } from "@xyflow/react";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

/**
 * Get content type from file extension
 */
function getContentTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const extensionMap: Record<string, string> = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    tif: "image/tiff",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    // Audio
    mp3: "audio/mp3",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/x-m4a",
    webm: "audio/webm",
    // Video
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    html: "text/html",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  };
  return extensionMap[ext] || "application/octet-stream";
}

/**
 * Wrapper component that handles the folder selection and batch processing flow.
 * This component manages both the FileBrowserDialog and FolderBatchDialog.
 */
const FolderBatchDialogWrapper: React.FC = memo(function FolderBatchDialogWrapper() {
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const { isDialogOpen, closeDialog, initializeBatch, start } = useFolderBatchStore();
  const { nodes, edges, workflow } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);
  
  // Refs for batch processing
  const processingRef = useRef(false);
  const currentRunIdRef = useRef(0);

  // When the main dialog opens, show the file browser first
  useEffect(() => {
    if (isDialogOpen && useFolderBatchStore.getState().state === "idle" && useFolderBatchStore.getState().files.length === 0) {
      setIsFileBrowserOpen(true);
    }
  }, [isDialogOpen]);

  /**
   * Process a single file by running the workflow with updated input
   */
  const processFile = useCallback(
    async (
      file: BatchFile,
      index: number,
      workflowNodes: Node<NodeData>[],
      workflowEdges: Edge[]
    ): Promise<void> => {
      const store = useFolderBatchStore.getState();
      const runnerStore = getWorkflowRunnerStore(workflow.id);
      const { run } = runnerStore.getState();

      // Skip files with no matching input
      if (!file.targetNodeId || !file.matchedType) {
        store.markFileSkipped(index);
        return;
      }

      const startTime = Date.now();
      store.markFileStarted(index);

      // Find the target input node and update its value
      const updatedNodes = workflowNodes.map((node) => {
        if (node.id === file.targetNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              properties: {
                ...node.data.properties,
                value: {
                  type: file.matchedType,
                  uri: `file://${file.path}`,
                  asset_id: null,
                  temp_id: null,
                },
              },
            },
          };
        }
        return node;
      });

      return new Promise<void>((resolve, reject) => {
        // Subscribe to runner state changes
        const unsubscribe = runnerStore.subscribe((state, prevState) => {
          if (state.state === "idle" && prevState.state === "running") {
            // Workflow completed
            const processingTime = Date.now() - startTime;
            useFolderBatchStore.getState().markFileCompleted(index, processingTime);
            unsubscribe();
            resolve();
          } else if (state.state === "error" || state.state === "cancelled") {
            // Workflow failed or was cancelled
            useFolderBatchStore.getState().markFileFailed(
              index,
              state.statusMessage || "Workflow execution failed"
            );
            unsubscribe();
            reject(new Error(state.statusMessage || "Execution failed"));
          }
        });

        // Run the workflow
        run({}, workflow, updatedNodes, workflowEdges, undefined).catch((error) => {
          useFolderBatchStore.getState().markFileFailed(
            index,
            error.message || "Failed to start workflow"
          );
          unsubscribe();
          reject(error);
        });
      });
    },
    [workflow]
  );

  /**
   * Main batch processing effect
   */
  useEffect(() => {
    const batchStore = useFolderBatchStore.getState();

    const processNextFile = async () => {
      const { state, currentIndex, files } = useFolderBatchStore.getState();

      if (state !== "running" || processingRef.current) {
        return;
      }

      if (currentIndex < 0 || currentIndex >= files.length) {
        return;
      }

      const runId = currentRunIdRef.current;
      processingRef.current = true;

      try {
        const file = files[currentIndex];
        await processFile(file, currentIndex, nodes, edges);

        // Check if we're still the active run and not stopped
        const currentState = useFolderBatchStore.getState();
        if (
          currentRunIdRef.current === runId &&
          currentState.state === "running"
        ) {
          currentState.nextFile();
        }
      } catch (error) {
        console.error("Error processing file:", error);
        // Move to next file even on error
        const currentState = useFolderBatchStore.getState();
        if (
          currentRunIdRef.current === runId &&
          currentState.state === "running"
        ) {
          currentState.nextFile();
        }
      } finally {
        processingRef.current = false;
      }
    };

    // Subscribe to batch store state changes
    const unsubscribe = useFolderBatchStore.subscribe((state, prevState) => {
      // Start processing when state changes to running
      if (state.state === "running" && !processingRef.current) {
        processNextFile();
      }
      // Start next file when currentIndex changes
      if (
        state.state === "running" &&
        state.currentIndex !== prevState.currentIndex &&
        state.currentIndex > 0
      ) {
        processNextFile();
      }
    });

    // Initial check for running state
    if (batchStore.state === "running" && !processingRef.current) {
      processNextFile();
    }

    return () => {
      unsubscribe();
    };
  }, [nodes, edges, processFile]);

  // Reset run counter when batch is stopped or completed
  useEffect(() => {
    const unsubscribe = useFolderBatchStore.subscribe((state) => {
      if (state.state === "stopped" || state.state === "idle") {
        currentRunIdRef.current += 1;
        processingRef.current = false;
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const loadFolderFiles = useCallback(
    async (folderPath: string, inputNodes: Node<NodeData>[]): Promise<BatchFile[]> => {
      const { data, error } = await client.GET("/api/files/list", {
        params: { query: { path: folderPath } },
      });

      if (error) {
        throw createErrorMessage(error, "Failed to list folder contents");
      }

      const files: BatchFile[] = [];

      for (const fileInfo of data as FileInfo[]) {
        if (fileInfo.is_dir) {continue;} // Skip directories

        const contentType = getContentTypeFromExtension(fileInfo.name);
        const matchedNode = matchFileToInputNode(contentType, inputNodes);
        const matchedType = matchedNode
          ? contentTypeToNodeType(contentType)
          : null;

        files.push({
          path: fileInfo.path,
          name: fileInfo.name,
          contentType,
          matchedType,
          targetNodeId: matchedNode?.id || null,
          status: "pending",
        });
      }

      return files;
    },
    []
  );

  const handleFolderSelect = useCallback(
    async (folderPath: string) => {
      setIsFileBrowserOpen(false);

      // Find input nodes in the workflow
      const inputNodes = findFileInputNodes(nodes);

      if (inputNodes.length === 0) {
        addNotification({
          type: "warning",
          alert: true,
          content: "No file input nodes found in the workflow. Add an Image, Audio, Video, or Document input node first.",
        });
        closeDialog();
        return;
      }

      try {
        const files = await loadFolderFiles(folderPath, inputNodes);

        if (files.length === 0) {
          addNotification({
            type: "warning",
            alert: true,
            content: "No files found in the selected folder.",
          });
          closeDialog();
          return;
        }

        const matchableFiles = files.filter((f) => f.targetNodeId !== null);
        if (matchableFiles.length === 0) {
          addNotification({
            type: "warning",
            alert: true,
            content: "No files in the folder match the workflow's input node types.",
          });
          closeDialog();
          return;
        }

        // Initialize and start batch
        initializeBatch(folderPath, files, workflow.id);
        start();
      } catch (error) {
        console.error("Failed to load folder:", error);
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to load folder contents. Please try again.",
        });
        closeDialog();
      }
    },
    [nodes, workflow.id, loadFolderFiles, initializeBatch, start, addNotification, closeDialog]
  );

  const handleFileBrowserClose = useCallback(() => {
    setIsFileBrowserOpen(false);
    // If no batch was started, close the main dialog too
    if (useFolderBatchStore.getState().files.length === 0) {
      closeDialog();
    }
  }, [closeDialog]);

  const handleBatchDialogClose = useCallback(() => {
    closeDialog();
  }, [closeDialog]);

  return (
    <>
      {/* File Browser for folder selection */}
      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={handleFileBrowserClose}
        onConfirm={handleFolderSelect}
        title="Select Folder for Batch Processing"
        selectionMode="directory"
        initialPath="~"
      />

      {/* Batch processing dialog */}
      <FolderBatchDialog
        open={isDialogOpen && !isFileBrowserOpen}
        onClose={handleBatchDialogClose}
      />
    </>
  );
});

export default FolderBatchDialogWrapper;
