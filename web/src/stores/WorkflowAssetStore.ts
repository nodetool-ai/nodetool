/**
 * WorkflowAssetStore manages assets scoped to specific workflows.
 *
 * Responsibilities:
 * - Load assets filtered by workflow_id
 * - Cache workflow assets separately from global assets
 * - Provide filtered views of workflow assets
 * - Track loading state per workflow
 *
 * This store complements AssetStore:
 * - AssetStore: Global asset management with folder navigation
 * - WorkflowAssetStore: Workflow-scoped asset views
 */

import { create } from "zustand";
import { Asset } from "./ApiTypes";
import { trpcClient } from "../trpc/client";
import { normalizeAssetList } from "../utils/normalizeAsset";

const EMPTY_ASSETS: Asset[] = [];

interface WorkflowAssetState {
  // Assets grouped by workflow ID
  assetsByWorkflow: Record<string, Asset[]>;

  // Loading state per workflow
  loadingByWorkflow: Record<string, boolean>;

  // Error state per workflow
  errorsByWorkflow: Record<string, Error | null>;
}

interface WorkflowAssetStore extends WorkflowAssetState {
  // Load assets for a workflow
  loadWorkflowAssets: (workflowId: string) => Promise<Asset[]>;

  // Get assets for a workflow
  getWorkflowAssets: (workflowId: string) => Asset[];

  // Clear assets for a workflow
  clearWorkflowAssets: (workflowId: string) => void;

  // Clear all workflow assets
  clearAllWorkflowAssets: () => void;

  // Check if workflow assets are loading
  isWorkflowLoading: (workflowId: string) => boolean;

  // Get error for a workflow
  getWorkflowError: (workflowId: string) => Error | null;
}

export const useWorkflowAssetStore = create<WorkflowAssetStore>(
  (set, get) => ({
    assetsByWorkflow: {},
    loadingByWorkflow: {},
    errorsByWorkflow: {},

    /**
     * Load assets for a specific workflow from the API.
     */
    loadWorkflowAssets: async (workflowId: string): Promise<Asset[]> => {
      // Set loading state
      set({
        loadingByWorkflow: {
          ...get().loadingByWorkflow,
          [workflowId]: true
        },
        errorsByWorkflow: {
          ...get().errorsByWorkflow,
          [workflowId]: null
        }
      });

      try {
        const data = await trpcClient.assets.list.query({
          workflow_id: workflowId
        });
        const assets = normalizeAssetList(
          (data.assets ?? []) as unknown as Asset[]
        );

        // Update state
        set({
          assetsByWorkflow: {
            ...get().assetsByWorkflow,
            [workflowId]: assets
          },
          loadingByWorkflow: {
            ...get().loadingByWorkflow,
            [workflowId]: false
          }
        });

        return assets;
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error("Failed to load assets");
        console.error("Failed to load workflow assets:", err);

        set({
          loadingByWorkflow: {
            ...get().loadingByWorkflow,
            [workflowId]: false
          },
          errorsByWorkflow: {
            ...get().errorsByWorkflow,
            [workflowId]: err
          }
        });

        throw err;
      }
    },

    /**
     * Get cached assets for a workflow.
     */
    getWorkflowAssets: (workflowId: string) => {
      return get().assetsByWorkflow[workflowId] ?? EMPTY_ASSETS;
    },

    /**
     * Clear assets for a specific workflow.
     */
    clearWorkflowAssets: (workflowId: string) => {
      const assetsByWorkflow = { ...get().assetsByWorkflow };
      delete assetsByWorkflow[workflowId];

      const loadingByWorkflow = { ...get().loadingByWorkflow };
      delete loadingByWorkflow[workflowId];

      const errorsByWorkflow = { ...get().errorsByWorkflow };
      delete errorsByWorkflow[workflowId];

      set({ assetsByWorkflow, loadingByWorkflow, errorsByWorkflow });
    },

    /**
     * Clear all workflow assets.
     */
    clearAllWorkflowAssets: () => {
      set({
        assetsByWorkflow: {},
        loadingByWorkflow: {},
        errorsByWorkflow: {}
      });
    },

    /**
     * Check if workflow assets are currently loading.
     */
    isWorkflowLoading: (workflowId: string) => {
      return get().loadingByWorkflow[workflowId] || false;
    },

    /**
     * Get error for a workflow.
     */
    getWorkflowError: (workflowId: string) => {
      return get().errorsByWorkflow[workflowId] || null;
    }
  })
);

export default useWorkflowAssetStore;
