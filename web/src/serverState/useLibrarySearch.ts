/**
 * Library search over tRPC (docs/plans/library-search.md, D20, D22, D25):
 * the debounced query the command palette sends, the index status it shows
 * while items are pending, and the search-by-meaning setup.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  QueryOutput,
  StatusOutput
} from "@nodetool-ai/protocol/api-schemas/search.js";
import { trpc } from "../trpc/client";

/** Queries shorter than this do not reach the server. */
export const LIBRARY_QUERY_MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const STATUS_POLL_MS = 3_000;

export interface LibrarySearchState {
  /** The query the shown hits answer; lags the typed text by the debounce. */
  query: string;
  data: QueryOutput | undefined;
  isFetching: boolean;
  isError: boolean;
  /** The failure's message while `isError`. */
  error: string | null;
  /** Ask again after a failure. */
  retry: () => void;
}

/** Search the library as the user types, across every project. */
export const useLibrarySearch = (text: string, enabled: boolean): LibrarySearchState => {
  const [query, setQuery] = useState(text.trim());
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [text]);
  const active = enabled && query.length >= LIBRARY_QUERY_MIN_CHARS;
  const result = trpc.search.query.useQuery(
    { query, limit: 8 },
    { enabled: active, staleTime: 10_000, placeholderData: (previous) => previous, retry: false }
  );
  const { refetch } = result;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const isError = active && result.isError;
  return {
    query,
    data: active ? result.data : undefined,
    isFetching: active && result.isFetching,
    isError,
    error: isError ? (result.error?.message ?? null) : null,
    retry
  };
};

/** Whether the index still has work: items to extract or passages to embed. */
export const libraryIndexBusy = (status: StatusOutput | undefined): boolean =>
  !!status && (status.items.pending > 0 || status.semantic.remaining > 0);

export interface LibrarySearchStatusState {
  status: StatusOutput | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** The index status, read again every few seconds while the index has work. */
export const useLibrarySearchStatus = (enabled: boolean): LibrarySearchStatusState => {
  const result = trpc.search.status.useQuery(undefined, {
    enabled,
    staleTime: 5_000,
    retry: false,
    refetchInterval: (query) => (libraryIndexBusy(query.state.data) ? STATUS_POLL_MS : false)
  });
  return { status: result.data, isLoading: result.isLoading, isError: result.isError };
};

export interface LibrarySearchSetupState {
  /** Turn search by meaning on with `model`, or off with null. */
  setUp: (model: { provider: string; model: string } | null) => Promise<void>;
  isPending: boolean;
  error: string | null;
}

export const useLibrarySearchSetup = (): LibrarySearchSetupState => {
  const utils = trpc.useUtils();
  const mutation = trpc.search.setup.useMutation({
    onSuccess: () => utils.search.status.invalidate()
  });
  return {
    setUp: async (model) => {
      await mutation.mutateAsync({ model });
    },
    isPending: mutation.isPending,
    error: mutation.error ? mutation.error.message : null
  };
};

export interface LibrarySearchRebuildState {
  rebuild: (scope: "vectors" | "all") => Promise<number>;
  isPending: boolean;
}

export const useLibrarySearchRebuild = (): LibrarySearchRebuildState => {
  const utils = trpc.useUtils();
  const mutation = trpc.search.rebuild.useMutation({
    onSuccess: () => utils.search.status.invalidate()
  });
  return {
    rebuild: async (scope) => (await mutation.mutateAsync({ scope })).items,
    isPending: mutation.isPending
  };
};
