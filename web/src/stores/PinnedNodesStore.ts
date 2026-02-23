/**
 * PinnedNodesStore
 *
 * Manages pinned nodes for quick access in workflows.
 * Users can pin important nodes to easily find and access them later.
 * Persists to localStorage for cross-session availability.
 *
 * @example
 * ```tsx
 * const { isPinned, togglePin, pinnedNodes } = usePinnedNodesStore();
 * ```
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a pinned node with metadata
 */
export interface PinnedNode {
  /** Unique identifier for the pinned node (workflowId:nodeId) */
  id: string;
  /** Workflow ID containing the node */
  workflowId: string;
  /** Node ID within the workflow */
  nodeId: string;
  /** Node type (e.g., "nodetool.image.GenerateImage") */
  nodeType: string;
  /** Optional custom label for the pinned node */
  label?: string;
  /** Timestamp when the node was pinned */
  timestamp: number;
}

interface PinnedNodesStore {
  /** Array of all pinned nodes */
  pinnedNodes: PinnedNode[];

  /**
   * Toggle the pinned state of a node
   * @param workflowId - The workflow ID
   * @param nodeId - The node ID
   * @param nodeType - The node type
   * @param label - Optional custom label
   */
  togglePin: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    label?: string
  ) => void;

  /**
   * Check if a specific node is pinned
   * @param workflowId - The workflow ID
   * @param nodeId - The node ID
   * @returns true if the node is pinned
   */
  isPinned: (workflowId: string, nodeId: string) => boolean;

  /**
   * Get all pinned nodes for a specific workflow
   * @param workflowId - The workflow ID
   * @returns Array of pinned nodes for the workflow
   */
  getPinnedNodesForWorkflow: (workflowId: string) => PinnedNode[];

  /**
   * Remove a pinned node
   * @param workflowId - The workflow ID
   * @param nodeId - The node ID
   */
  unpinNode: (workflowId: string, nodeId: string) => void;

  /**
   * Clear all pinned nodes
   */
  clearAllPins: () => void;

  /**
   * Get all pinned nodes
   * @returns Array of all pinned nodes
   */
  getAllPinnedNodes: () => PinnedNode[];
}

/**
 * Creates a unique ID for a pinned node entry
 */
const createPinnedNodeId = (workflowId: string, nodeId: string): string => {
  return `${workflowId}:${nodeId}`;
};

/**
 * Maximum number of pinned nodes allowed per workflow
 */
const MAX_PINNED_NODES = 20;

/**
 * Zustand store for managing pinned nodes
 *
 * Features:
 * - Persistent storage using localStorage
 * - Automatic deduplication (re-pinning updates timestamp)
 * - Per-workflow limits
 * - Efficient lookups by workflow/node
 */
export const usePinnedNodesStore = create<PinnedNodesStore>()(
  persist(
    (set, get) => ({
      pinnedNodes: [],

      togglePin: (
        workflowId: string,
        nodeId: string,
        nodeType: string,
        label?: string
      ) => {
        const pinnedId = createPinnedNodeId(workflowId, nodeId);
        const existingIndex = get().pinnedNodes.findIndex(
          (node) => node.id === pinnedId
        );

        if (existingIndex !== -1) {
          // Node is already pinned - unpin it
          set((state) => ({
            pinnedNodes: state.pinnedNodes.filter((node) => node.id !== pinnedId)
          }));
        } else {
          // Pin the node
          set((state) => {
            const workflowPins = state.pinnedNodes.filter(
              (node) => node.workflowId === workflowId
            );

            // Check if we've hit the limit for this workflow
            if (workflowPins.length >= MAX_PINNED_NODES) {
              // Remove the oldest pin for this workflow
              const oldestWorkflowPinId = workflowPins.sort(
                (a, b) => a.timestamp - b.timestamp
              )[0].id;

              return {
                pinnedNodes: [
                  ...state.pinnedNodes.filter((node) => node.id !== oldestWorkflowPinId),
                  {
                    id: pinnedId,
                    workflowId,
                    nodeId,
                    nodeType,
                    label,
                    timestamp: Date.now()
                  }
                ]
              };
            }

            return {
              pinnedNodes: [
                ...state.pinnedNodes,
                {
                  id: pinnedId,
                  workflowId,
                  nodeId,
                  nodeType,
                  label,
                  timestamp: Date.now()
                }
              ]
            };
          });
        }
      },

      isPinned: (workflowId: string, nodeId: string) => {
        const pinnedId = createPinnedNodeId(workflowId, nodeId);
        return get().pinnedNodes.some((node) => node.id === pinnedId);
      },

      getPinnedNodesForWorkflow: (workflowId: string) => {
        return get().pinnedNodes
          .filter((node) => node.workflowId === workflowId)
          .sort((a, b) => b.timestamp - a.timestamp);
      },

      unpinNode: (workflowId: string, nodeId: string) => {
        const pinnedId = createPinnedNodeId(workflowId, nodeId);
        set((state) => ({
          pinnedNodes: state.pinnedNodes.filter((node) => node.id !== pinnedId)
        }));
      },

      clearAllPins: () => {
        set({ pinnedNodes: [] });
      },

      getAllPinnedNodes: () => {
        return get().pinnedNodes;
      }
    }),
    {
      name: "nodetool-pinned-nodes",
      version: 1
    }
  )
);
