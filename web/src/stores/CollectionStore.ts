import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { restFetch } from "../lib/rest-fetch";
import { CollectionList as CollectionListType } from "./ApiTypes";
import { trpcClient } from "../trpc/client";
import { queryClient } from "../queryClient";

interface IndexResponseData {
  path: string;
  error?: string | null;
}

interface IndexError {
  file: string;
  error: string;
}

interface IndexProgressState {
  collection: string;
  current: number;
  total: number;
  startTime: number;
}

interface CollectionStore {
  collections: CollectionListType | null;
  isLoading: boolean;
  error: string | null;
  deleteTarget: string | null;
  showForm: boolean;
  dragOverCollection: string | null;
  indexProgress: IndexProgressState | null;
  indexErrors: IndexError[];
  isElectron: boolean;
  selectedCollections: string[];

  setCollections: (collections: CollectionListType) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setDeleteTarget: (target: string | null) => void;
  setShowForm: (show: boolean) => void;
  setDragOverCollection: (collection: string | null) => void;
  setIndexProgress: (progress: IndexProgressState | null) => void;
  setIndexErrors: (errors: IndexError[]) => void;
  setSelectedCollections: (collections: string[]) => void;

  fetchCollections: () => Promise<void>;
  deleteCollection: (collectionName: string) => Promise<void>;
  confirmDelete: () => Promise<void>;
  cancelDelete: () => void;

  handleDragOver: (event: React.DragEvent, collection: string) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDrop: (collectionName: string) => (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
}

// Monotonic token identifying the latest drop. Overlapping drops each capture
// their own token; only the latest drop is allowed to write the shared
// indexProgress/indexErrors state, so an older in-flight drop can't clobber
// the progress UI of a newer one.
let dropCounter = 0;

export const useCollectionStore = create<CollectionStore>()(
  devtools(
    (set, get) => ({
      collections: null,
      isLoading: false,
      error: null,
      deleteTarget: null,
      showForm: false,
      dragOverCollection: null,
      indexProgress: null,
      indexErrors: [],
      isElectron: window.api !== undefined,
      selectedCollections: [],

      setCollections: (collections) => set({ collections }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setDeleteTarget: (target) => set({ deleteTarget: target }),
      setShowForm: (show) => set({ showForm: show }),
      setDragOverCollection: (collection) => set({ dragOverCollection: collection }),
      setIndexProgress: (progress) => set({ indexProgress: progress }),
      setIndexErrors: (errors) => set({ indexErrors: errors }),
      setSelectedCollections: (collections) => set({ selectedCollections: collections }),

      fetchCollections: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await trpcClient.collections.list.query();
          set({
            collections: data as CollectionListType,
            isLoading: false
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Error loading collections",
            isLoading: false
          });
        }
      },

      deleteCollection: async (collectionName: string) => {
        await trpcClient.collections.delete.mutate({ name: collectionName });
        await get().fetchCollections();
        // Collections are not DBModels and don't broadcast resource_change,
        // so React Query consumers (CollectionProperty) need an explicit kick.
        queryClient.invalidateQueries({ queryKey: ["collections"] });
      },

      confirmDelete: async () => {
        const deleteTarget = get().deleteTarget;
        if (deleteTarget) {
          await get().deleteCollection(deleteTarget);
          set({ deleteTarget: null });
        }
      },

      cancelDelete: () => {
        set({ deleteTarget: null });
      },

      handleDragOver: (event: React.DragEvent, collection: string) => {
        event.preventDefault();
        set({ dragOverCollection: collection });
      },

      handleDragLeave: (event: React.DragEvent) => {
        event.preventDefault();
        set({ dragOverCollection: null });
      },

      handleDrop: (collectionName: string) => async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        set({ dragOverCollection: null });

        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) {return;}

        const dropId = ++dropCounter;
        const isLatestDrop = () => dropId === dropCounter;

        set({
          indexErrors: [],
          indexProgress: {
            collection: collectionName,
            current: 0,
            total: files.length,
            startTime: Date.now()
          }
        });

        const errors: IndexError[] = [];
        let completed = 0;

        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);

          try {
            const response = await restFetch(
              `/api/collections/${encodeURIComponent(collectionName)}/index`,
              {
                method: "POST",
                body: formData
              }
            );

            const data: unknown = await response.json().catch(() => null);

            const indexData = data as IndexResponseData | undefined;
            const errorDetail = data as { detail?: { msg?: string }[] } | undefined;

            if (!response.ok || indexData?.error) {
              errors.push({
                file: file.name,
                error:
                  errorDetail?.detail?.[0]?.msg ||
                  indexData?.error ||
                  "Unknown error"
              });
            }
          } catch (err: unknown) {
            console.error(`Failed to index file ${file.name}:`, err);
            errors.push({
              file: file.name,
              error: err instanceof Error ? err.message : String(err)
            });
          } finally {
            completed++;
            if (isLatestDrop()) {
              set((state) => ({
                indexProgress: state.indexProgress
                  ? {
                      ...state.indexProgress,
                      current: completed
                    }
                  : null
              }));
            }
          }
        }

        await get().fetchCollections();
        // Indexing changes the collection's document count; refresh consumers.
        queryClient.invalidateQueries({ queryKey: ["collections"] });
        if (isLatestDrop()) {
          set({ indexProgress: null, indexErrors: errors });
        }
      }
    }),
    {
      name: "collection-store"
    }
  )
);
