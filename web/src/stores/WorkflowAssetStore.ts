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

// Per-workflow request token: only the most recent in-flight request
// for a given workflow may write back. Earlier requests bail silently so
// a slow response can't clobber newer data.
//
// Tokens are unique object references (not counters) so the map can be
// safely pruned on `clearWorkflowAssets` without risking that a freshly
// minted counter value collides with one captured by an earlier
// in-flight call against the same workflowId.
const loadTokens = new Map<string, object>();

export const useWorkflowAssetStore = create<WorkflowAssetStore>(
  (set, get) => ({
    assetsByWorkflow: {},
    loadingByWorkflow: {},
    errorsByWorkflow: {},

    /**
     * Load assets for a specific workflow from the API.
     */
    loadWorkflowAssets: async (workflowId: string): Promise<Asset[]> => {
      const token = {};
      loadTokens.set(workflowId, token);

      const isCurrent = () => loadTokens.get(workflowId) === token;

      // Set loading state via functional setter so concurrent loads for
      // different workflows don't drop each other's entries.
      set((state) => ({
        loadingByWorkflow: {
          ...state.loadingByWorkflow,
          [workflowId]: true
        },
        errorsByWorkflow: {
          ...state.errorsByWorkflow,
          [workflowId]: null
        }
      }));

      try {
        const data = await trpcClient.assets.list.query({
          workflow_id: workflowId
        });
        const assets = normalizeAssetList(data.assets ?? []);

        if (!isCurrent()) {
          return assets;
        }

        set((state) => ({
          assetsByWorkflow: {
            ...state.assetsByWorkflow,
            [workflowId]: assets
          },
          loadingByWorkflow: {
            ...state.loadingByWorkflow,
            [workflowId]: false
          }
        }));

        return assets;
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error("Failed to load assets");
        console.error("Failed to load workflow assets:", err);

        if (isCurrent()) {
          set((state) => ({
            loadingByWorkflow: {
              ...state.loadingByWorkflow,
              [workflowId]: false
            },
            errorsByWorkflow: {
              ...state.errorsByWorkflow,
              [workflowId]: err
            }
          }));
        }

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
      // Drop the in-flight token entirely. Bumping a counter only would
      // leave loadTokens growing unbounded across long sessions, which
      // would just relocate the lifecycle leak we're trying to fix.
      loadTokens.delete(workflowId);
      set((state) => {
        const assetsByWorkflow = { ...state.assetsByWorkflow };
        delete assetsByWorkflow[workflowId];

        const loadingByWorkflow = { ...state.loadingByWorkflow };
        delete loadingByWorkflow[workflowId];

        const errorsByWorkflow = { ...state.errorsByWorkflow };
        delete errorsByWorkflow[workflowId];

        return { assetsByWorkflow, loadingByWorkflow, errorsByWorkflow };
      });
    },

    /**
     * Clear all workflow assets.
     */
    clearAllWorkflowAssets: () => {
      loadTokens.clear();
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
