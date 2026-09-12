import { useCallback, useEffect, useRef, useState } from "react";
import { useAssetStore } from "../stores/AssetStore";
import { AssetSearchResult } from "../stores/ApiTypes";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";

export const useAssetSearch = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const projectAbortControllerRef = useRef(new AbortController());
  const latestRequestIdRef = useRef(0);
  const search = useAssetStore((state) => state.search);
  const projectId = useWorkspaceTabsStore(
    (state) =>
      state.activeProjectId ?? state.personalProjectId ?? LOOSE_PROJECT_ID
  );

  useEffect(() => {
    const abortController = new AbortController();
    projectAbortControllerRef.current.abort();
    projectAbortControllerRef.current = abortController;
    return () => abortController.abort();
  }, [projectId]);

  const searchAssets = useCallback(
    async (
      query: string,
      contentType?: string,
      pageSize: number = 100,
      cursor?: string,
      signal?: AbortSignal
    ): Promise<AssetSearchResult | null> => {
      if (query.trim().length < 2) {
        setSearchError("Search query must be at least 2 characters long");
        return null;
      }

      const projectSignal = projectAbortControllerRef.current.signal;
      const requestSignal = signal
        ? AbortSignal.any([signal, projectSignal])
        : projectSignal;
      if (requestSignal.aborted) {
        return null;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setIsSearching(true);
      setSearchError(null);

      try {
        const result = await search(
          {
            query: query.trim(),
            content_type: contentType,
            page_size: pageSize,
            cursor,
            project_id: projectId
          },
          requestSignal
        );

        if (requestSignal.aborted) {
          return null;
        }

        return result;
      } catch (error) {
        // Aborted requests are expected — surface no error
        if (requestSignal.aborted) {
          return null;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "An error occurred while searching assets";
        setSearchError(errorMessage);
        return null;
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setIsSearching(false);
        }
      }
    },
    [projectId, search]
  );

  const clearError = useCallback(() => {
    setSearchError(null);
  }, []);

  return {
    searchAssets,
    isSearching,
    searchError,
    clearError
  };
};

export default useAssetSearch;
