/**
 * React Query bindings for the documents browser.
 *
 * Browsing is server state, so it stays in React Query. Only the *open*
 * document moves into a Zustand store (see `documentStore.ts`), because that is
 * the one thing agent tools must reach from outside React.
 *
 * Queries go through the kind's `DocumentBackend` rather than a tRPC hook: the
 * four kinds do not share one router (scripts have their own), and routing that
 * choice through the backend keeps it in the one place that already knows.
 */

import { useCallback, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { documentBackend, type DocumentSummary } from './backends';
import { disposeDocumentStore } from './documentStore';
import { type DocumentKind } from './kinds';

export interface DocumentListEntry {
  kind: DocumentKind;
  id: string;
  name: string;
  updatedAt: string;
  /** Kind-specific detail, e.g. "12 lines". */
  detail?: string;
}

const listKey = (kind: DocumentKind, limit: number): QueryKey => [
  'documents',
  kind,
  limit,
];

/** One kind's documents. */
function useDocumentsOfKind(
  kind: DocumentKind,
  limit = 50
): UseQueryResult<DocumentListEntry[], Error> {
  return useQuery({
    queryKey: listKey(kind, limit),
    queryFn: async (): Promise<DocumentListEntry[]> => {
      const summaries = await documentBackend(kind).list(limit);
      return summaries.map((summary) => ({
        kind,
        id: summary.id,
        name: summary.name || `Untitled ${kind}`,
        updatedAt: summary.updatedAt,
        detail: summary.detail,
      }));
    },
  });
}

/** Every kind's queries collapsed into one list, one status, one error. */
interface AllDocuments {
  documents: DocumentListEntry[];
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Every browsable kind in one list, newest first across kinds.
 *
 * One hook call per kind rather than a loop, so the hook order is fixed and the
 * memo's dependencies can name the exact values it reads.
 */
export function useAllDocuments(limit = 50): AllDocuments {
  const storyboards = useDocumentsOfKind('storyboard', limit);
  const scripts = useDocumentsOfKind('script', limit);
  const jsScripts = useDocumentsOfKind('jsscript', limit);
  const timelines = useDocumentsOfKind('timeline', limit);
  const sketches = useDocumentsOfKind('sketch', limit);

  const documents = useMemo(
    () =>
      [
        ...(storyboards.data ?? []),
        ...(scripts.data ?? []),
        ...(jsScripts.data ?? []),
        ...(timelines.data ?? []),
        ...(sketches.data ?? []),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [
      storyboards.data,
      scripts.data,
      jsScripts.data,
      timelines.data,
      sketches.data,
    ]
  );

  const queries = [storyboards, scripts, jsScripts, timelines, sketches];

  return {
    documents,
    isLoading: queries.some((query) => query.isLoading),
    isRefetching: queries.some((query) => query.isRefetching),
    // Surface the first failure; the browser shows one banner, not one per kind.
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => {
      for (const query of queries) {
        void query.refetch();
      }
    },
  };
}

/** Invalidate one kind's list, whatever page size it was fetched with. */
function useInvalidateKind() {
  const queryClient = useQueryClient();
  return useCallback(
    (kind: DocumentKind) =>
      queryClient.invalidateQueries({ queryKey: ['documents', kind] }),
    [queryClient]
  );
}

export function useCreateDocument(): UseMutationResult<
  DocumentSummary & { kind: DocumentKind },
  Error,
  { kind: DocumentKind; name: string }
> {
  const invalidate = useInvalidateKind();
  return useMutation({
    mutationFn: async ({ kind, name }: { kind: DocumentKind; name: string }) => {
      const created = await documentBackend(kind).create(name);
      return { kind, ...created };
    },
    onSuccess: ({ kind }) => {
      void invalidate(kind);
    },
  });
}

export function useRenameDocument(): UseMutationResult<
  { kind: DocumentKind; id: string; name: string },
  Error,
  { kind: DocumentKind; id: string; name: string }
> {
  const invalidate = useInvalidateKind();
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      name,
    }: {
      kind: DocumentKind;
      id: string;
      name: string;
    }) => {
      await documentBackend(kind).rename(id, name);
      return { kind, id, name };
    },
    onSuccess: ({ kind }) => {
      void invalidate(kind);
    },
  });
}

export function useDeleteDocument(): UseMutationResult<
  { kind: DocumentKind; id: string },
  Error,
  { kind: DocumentKind; id: string }
> {
  const invalidate = useInvalidateKind();
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: DocumentKind; id: string }) => {
      await documentBackend(kind).remove(id);
      return { kind, id };
    },
    onSuccess: ({ kind, id }) => {
      // The cached store would otherwise keep serving a document that no
      // longer exists if the same id were somehow reopened.
      disposeDocumentStore(kind, id);
      void invalidate(kind);
    },
  });
}
