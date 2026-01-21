/**
 * useFolderBatch hook orchestrates batch processing of files from a folder.
 *
 * This hook:
 * - Detects input nodes in the current workflow
 * - Matches files to appropriate input nodes based on content type
 * - Runs the workflow for each matching file
 * - Tracks progress and handles errors
 */

import { useCallback, useEffect, useRef } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import {
  useFolderBatchStore,
  BatchFile,
  FolderBatchState,
} from "../stores/FolderBatchStore";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";
import { contentTypeToNodeType } from "../utils/NodeTypeMapping";
import { WorkflowAttributes, FileInfo } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";

/**
 * Maps input node types to their accepted content types
 */
const INPUT_NODE_TYPE_MAP: Record<string, string[]> = {
  "nodetool.input.ImageInput": [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/tiff",
    "image/bmp",
    "image/heic",
    "image/heif",
  ],
  "nodetool.input.AudioInput": [
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/mp3",
    "audio/aac",
    "audio/flac",
    "audio/x-m4a",
  ],
  "nodetool.input.VideoInput": [
    "video/mp4",
    "video/mpeg",
    "video/ogg",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
  ],
  "nodetool.input.DocumentInput": [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/html",
    "text/markdown",
  ],
  "nodetool.input.DataFrameInput": ["text/csv", "application/json"],
};

/**
 * Find input nodes in the workflow that accept file inputs
 */
export function findFileInputNodes(nodes: Node<NodeData>[]): Node<NodeData>[] {
  const fileInputTypes = Object.keys(INPUT_NODE_TYPE_MAP);
  return nodes.filter((node) => fileInputTypes.includes(node.type || ""));
}

/**
 * Match a file to the appropriate input node based on content type
 */
export function matchFileToInputNode(
  contentType: string,
  inputNodes: Node<NodeData>[]
): Node<NodeData> | null {
  for (const node of inputNodes) {
    const nodeType = node.type || "";
    const acceptedTypes = INPUT_NODE_TYPE_MAP[nodeType] || [];
    if (acceptedTypes.includes(contentType)) {
      return node;
    }
  }
  return null;
}

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

interface UseFolderBatchOptions {
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface UseFolderBatchReturn {
  /** Open the folder selection dialog and start batch processing */
  startBatch: (folderPath: string) => Promise<void>;
  /** Current batch state */
  state: FolderBatchState;
  /** Current batch files */
  files: BatchFile[];
  /** Current file index being processed */
  currentIndex: number;
  /** Pause batch processing */
  pause: () => void;
  /** Resume batch processing */
  resume: () => void;
  /** Stop batch processing */
  stop: () => void;
  /** Get elapsed time */
  getElapsedTime: () => number;
  /** Get estimated remaining time */
  getEstimatedTimeRemaining: () => number | null;
  /** Get progress percentage */
  getProgress: () => number;
  /** Get completed count */
  getCompletedCount: () => number;
  /** Get failed count */
  getFailedCount: () => number;
  /** Find file input nodes in the workflow */
  getFileInputNodes: () => Node<NodeData>[];
}

export function useFolderBatch({
  workflow,
  nodes,
  edges,
}: UseFolderBatchOptions): UseFolderBatchReturn {
  const store = useFolderBatchStore();
  const processingRef = useRef(false);
  const currentRunRef = useRef<number>(0);

  const getFileInputNodes = useCallback(() => {
    return findFileInputNodes(nodes);
  }, [nodes]);

  /**
   * Load files from a folder
   */
  const loadFolderFiles = useCallback(
    async (folderPath: string): Promise<BatchFile[]> => {
      const { data, error } = await client.GET("/api/files/list", {
        params: { query: { path: folderPath } },
      });

      if (error) {
        throw createErrorMessage(error, "Failed to list folder contents");
      }

      const inputNodes = getFileInputNodes();
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
    [getFileInputNodes]
  );

  /**
   * Start batch processing
   */
  const startBatch = useCallback(
    async (folderPath: string) => {
      try {
        const files = await loadFolderFiles(folderPath);
        store.initializeBatch(folderPath, files, workflow.id);
        store.start();
      } catch (error) {
        console.error("Failed to start batch:", error);
        throw error;
      }
    },
    [loadFolderFiles, store, workflow.id]
  );

  /**
   * Process a single file
   */
  const processFile = useCallback(
    async (file: BatchFile, index: number): Promise<void> => {
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
      const updatedNodes = nodes.map((node) => {
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
            store.markFileCompleted(index, processingTime);
            unsubscribe();
            resolve();
          } else if (state.state === "error" || state.state === "cancelled") {
            // Workflow failed or was cancelled
            store.markFileFailed(
              index,
              state.statusMessage || "Workflow execution failed"
            );
            unsubscribe();
            reject(new Error(state.statusMessage || "Execution failed"));
          }
        });

        // Run the workflow
        run({}, workflow, updatedNodes, edges, undefined).catch((error) => {
          store.markFileFailed(
            index,
            error.message || "Failed to start workflow"
          );
          unsubscribe();
          reject(error);
        });
      });
    },
    [workflow, nodes, edges, store]
  );

  /**
   * Main processing loop
   */
  useEffect(() => {
    const processNextFile = async () => {
      const { state, currentIndex, files } = store;

      if (state !== "running" || processingRef.current) {
        return;
      }

      if (currentIndex < 0 || currentIndex >= files.length) {
        return;
      }

      const currentRun = currentRunRef.current;
      processingRef.current = true;

      try {
        const file = files[currentIndex];
        await processFile(file, currentIndex);
        
        // Check if we're still the active run and not stopped
        if (
          currentRunRef.current === currentRun &&
          store.state === "running"
        ) {
          store.nextFile();
        }
      } catch (error) {
        console.error("Error processing file:", error);
        // Move to next file even on error
        if (
          currentRunRef.current === currentRun &&
          store.state === "running"
        ) {
          store.nextFile();
        }
      } finally {
        processingRef.current = false;
      }
    };

    // Start processing when state changes to running
    if (store.state === "running" && !processingRef.current) {
      processNextFile();
    }
  }, [store.state, store.currentIndex, store.files, processFile, store]);

  // Reset run counter when batch is stopped or completed
  useEffect(() => {
    if (store.state === "stopped" || store.state === "idle") {
      currentRunRef.current += 1;
      processingRef.current = false;
    }
  }, [store.state]);

  return {
    startBatch,
    state: store.state,
    files: store.files,
    currentIndex: store.currentIndex,
    pause: store.pause,
    resume: store.resume,
    stop: store.stop,
    getElapsedTime: store.getElapsedTime,
    getEstimatedTimeRemaining: store.getEstimatedTimeRemaining,
    getProgress: store.getProgress,
    getCompletedCount: store.getCompletedCount,
    getFailedCount: store.getFailedCount,
    getFileInputNodes,
  };
}

export default useFolderBatch;
