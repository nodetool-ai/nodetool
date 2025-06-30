import { useCallback, useState } from "react";
import { useAssetStore } from "../stores/AssetStore";
import { AssetSearchResult } from "../stores/ApiTypes";

export const useAssetSearch = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const search = useAssetStore((state) => state.search);

  const searchAssets = useCallback(
    async (
      query: string,
      contentType?: string,
      pageSize: number = 100,
      cursor?: string,
      signal?: AbortSignal
    ): Promise<AssetSearchResult | null> => {
      // Validate query length
      if (query.trim().length < 2) {
        setSearchError("Search query must be at least 2 characters long");
        return null;
      }

      // Check if already aborted
      if (signal?.aborted) {
        return null;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const result = await search({
          query: query.trim(),
          content_type: contentType,
          page_size: pageSize,
          cursor: cursor
        });

        // Check if aborted after async operation
        if (signal?.aborted) {
          return null;
        }

        return result;
      } catch (error) {
        // Don't set error if request was aborted
        if (signal?.aborted) {
          return null;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "An error occurred while searching assets";
        setSearchError(errorMessage);
        return null;
      } finally {
        if (!signal?.aborted) {
          setIsSearching(false);
        }
      }
    },
    [search]
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
