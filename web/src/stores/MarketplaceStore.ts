/**
 * MarketplaceStore - Research Feature
 *
 * Manages workflow sharing, export, and import for a marketplace ecosystem.
 *
 * Features:
 * - Export workflows as shareable JSON with metadata
 * - Import workflows from URLs or files
 * - Track imported/shared workflows
 * - Generate shareable links for workflows
 *
 * This is an EXPERIMENTAL feature for research purposes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "./ApiTypes";

export interface ShareableWorkflowMetadata {
  name: string;
  description: string;
  author?: string;
  tags: string[];
  version: string;
  createdAt: string;
  nodetoolVersion: string;
  category?: WorkflowCategory;
}

export interface ShareableWorkflowInput {
  name: string;
  description: string;
  author?: string;
  tags: string[];
  version: string;
  category?: WorkflowCategory;
}

export type WorkflowCategory =
  | "text-generation"
  | "image-generation"
  | "audio-generation"
  | "video-generation"
  | "data-processing"
  | "automation"
  | "research"
  | "education"
  | "other";

export interface ShareableWorkflow {
  metadata: ShareableWorkflowMetadata;
  graph: {
    nodes: Node[];
    edges: Edge[];
  };
  compatibility?: {
    minNodeToolVersion: string;
    requiredNodes: string[];
    optionalNodes: string[];
  };
}

export interface ImportedWorkflow {
  id: string;
  source: "url" | "file" | "clipboard";
  sourceUrl?: string;
  importedAt: number;
  workflow: ShareableWorkflow;
}

export interface MarketplaceState {
  exportedWorkflows: ShareableWorkflow[];
  importedWorkflows: ImportedWorkflow[];
  recentShareUrls: string[];
  isExportDialogOpen: boolean;
  isImportDialogOpen: boolean;
  isLoading: boolean;
  error: string | null;

  exportWorkflow: (
    graph: { nodes: Node[]; edges: Edge[] },
    input: ShareableWorkflowInput
  ) => ShareableWorkflow;

  importFromUrl: (url: string) => Promise<ShareableWorkflow>;
  importFromFile: (file: File) => Promise<ShareableWorkflow>;
  importFromClipboard: (json: string) => Promise<ShareableWorkflow>;

  addExportedWorkflow: (workflow: ShareableWorkflow) => void;
  addImportedWorkflow: (workflow: ImportedWorkflow) => void;
  removeImportedWorkflow: (id: string) => void;
  clearImportedWorkflows: () => void;

  addShareUrl: (url: string) => void;

  setExportDialogOpen: (open: boolean) => void;
  setImportDialogOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  generateShareUrl: (workflow: ShareableWorkflow) => string;
  parseShareUrl: (url: string) => { id: string; version: number } | null;
}

const MARKETPLACE_VERSION = "1.0.0";

const validateShareableWorkflow = (data: unknown): data is ShareableWorkflow => {
  if (!data || typeof data !== "object") {
    return false;
  }

  const wf = data as Record<string, unknown>;
  return (
    typeof wf.metadata === "object" &&
    wf.metadata !== null &&
    typeof (wf.metadata as Record<string, unknown>).name === "string" &&
    typeof (wf.metadata as Record<string, unknown>).description === "string" &&
    Array.isArray((wf.metadata as Record<string, unknown>).tags) &&
    typeof wf.graph === "object" &&
    wf.graph !== null &&
    Array.isArray((wf.graph as Record<string, unknown>).nodes) &&
    Array.isArray((wf.graph as Record<string, unknown>).edges)
  );
};

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      exportedWorkflows: [],
      importedWorkflows: [],
      recentShareUrls: [],
      isExportDialogOpen: false,
      isImportDialogOpen: false,
      isLoading: false,
      error: null,

      exportWorkflow: (
        graph: { nodes: Node[]; edges: Edge[] },
        input: ShareableWorkflowInput
      ): ShareableWorkflow => {
        const shareableWorkflow: ShareableWorkflow = {
          metadata: {
            ...input,
            version: input.version || "1.0.0",
            createdAt: new Date().toISOString(),
            nodetoolVersion: MARKETPLACE_VERSION
          },
          graph,
          compatibility: {
            minNodeToolVersion: "0.1.0",
            requiredNodes: [...new Set(graph.nodes.map(n => n.type))],
            optionalNodes: []
          }
        };

        get().addExportedWorkflow(shareableWorkflow);
        return shareableWorkflow;
      },

      importFromUrl: async (url: string): Promise<ShareableWorkflow> => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch workflow: ${response.statusText}`);
          }

          const data = await response.json();

          if (!validateShareableWorkflow(data)) {
            throw new Error("Invalid workflow format");
          }

          set({ isLoading: false });

          const importedWorkflow: ImportedWorkflow = {
            id: crypto.randomUUID(),
            source: "url",
            sourceUrl: url,
            importedAt: Date.now(),
            workflow: data
          };

          get().addImportedWorkflow(importedWorkflow);
          get().addShareUrl(url);

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      importFromFile: async (file: File): Promise<ShareableWorkflow> => {
        set({ isLoading: true, error: null });

        try {
          const text = await file.text();
          const data = JSON.parse(text);

          if (!validateShareableWorkflow(data)) {
            throw new Error("Invalid workflow format in file");
          }

          set({ isLoading: false });

          const importedWorkflow: ImportedWorkflow = {
            id: crypto.randomUUID(),
            source: "file",
            importedAt: Date.now(),
            workflow: data
          };

          get().addImportedWorkflow(importedWorkflow);

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      importFromClipboard: async (json: string): Promise<ShareableWorkflow> => {
        set({ isLoading: true, error: null });

        try {
          const data = JSON.parse(json);

          if (!validateShareableWorkflow(data)) {
            throw new Error("Invalid workflow format in clipboard");
          }

          set({ isLoading: false });

          const importedWorkflow: ImportedWorkflow = {
            id: crypto.randomUUID(),
            source: "clipboard",
            importedAt: Date.now(),
            workflow: data
          };

          get().addImportedWorkflow(importedWorkflow);

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      addExportedWorkflow: (workflow: ShareableWorkflow): void => {
        set((state) => ({
          exportedWorkflows: [workflow, ...state.exportedWorkflows.slice(0, 49)]
        }));
      },

      addImportedWorkflow: (workflow: ImportedWorkflow): void => {
        set((state) => ({
          importedWorkflows: [workflow, ...state.importedWorkflows.slice(0, 99)]
        }));
      },

      removeImportedWorkflow: (id: string): void => {
        set((state) => ({
          importedWorkflows: state.importedWorkflows.filter(w => w.id !== id)
        }));
      },

      clearImportedWorkflows: (): void => {
        set({ importedWorkflows: [] });
      },

      addShareUrl: (url: string): void => {
        set((state) => ({
          recentShareUrls: [url, ...state.recentShareUrls.filter(u => u !== url)].slice(0, 9)
        }));
      },

      setExportDialogOpen: (open: boolean): void => {
        set({ isExportDialogOpen: open });
      },

      setImportDialogOpen: (open: boolean): void => {
        set({ isImportDialogOpen: open, error: null });
      },

      setLoading: (loading: boolean): void => {
        set({ isLoading: loading });
      },

      setError: (error: string | null): void => {
        set({ error });
      },

      generateShareUrl: (workflow: ShareableWorkflow): string => {
        const base64 = btoa(JSON.stringify(workflow));
        const id = workflow.metadata.name.toLowerCase().replace(/\s+/g, "-");
        const version = workflow.metadata.version;
        return `${window.location.origin}/share/${id}?v=${version}#${base64}`;
      },

      parseShareUrl: (url: string): { id: string; version: number } | null => {
        try {
          const urlObj = new URL(url);
          const hash = urlObj.hash.slice(1);
          const workflow = JSON.parse(atob(hash));
          return {
            id: workflow.metadata?.name || "",
            version: parseInt(workflow.metadata?.version || "1", 10)
          };
        } catch {
          return null;
        }
      }
    }),
    {
      name: "marketplace-storage",
      partialize: (state) => ({
        exportedWorkflows: state.exportedWorkflows.slice(0, 10),
        importedWorkflows: state.importedWorkflows.slice(0, 20),
        recentShareUrls: state.recentShareUrls
      })
    }
  )
);

export default useMarketplaceStore;
