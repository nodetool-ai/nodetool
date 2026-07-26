/**
 * TanStack Query bindings for the documents browser.
 *
 * Browsing is server state, so it stays in tRPC + React Query. Only the *open*
 * document moves into a Zustand store (see `documentStore.ts`), because that is
 * the one thing agent tools must reach from outside React.
 */

import { useMemo } from 'react';
import type { ResourceKind } from '@nodetool-ai/app-runtime';

import { trpc } from '../trpc/client';
import { disposeDocumentStore } from './documentStore';

export interface DocumentListEntry {
  kind: ResourceKind;
  id: string;
  name: string;
  updatedAt: string;
}

/** One kind's documents, newest first. */
export function useDocumentsOfKind(kind: ResourceKind, limit = 50) {
  const query = trpc.resources.list.useQuery(
    { kind, limit },
    {
      select: (summaries) =>
        summaries.map(
          (summary): DocumentListEntry => ({
            kind: summary.ref.kind,
            id: summary.ref.id,
            name: summary.name || `Untitled ${kind}`,
            updatedAt: summary.updatedAt,
          })
        ),
    }
  );
  return query;
}

/**
 * Every browsable kind in one list, newest first across kinds.
 *
 * One hook call per kind rather than a loop, so the hook order is fixed and the
 * memo's dependencies can name the exact values it reads.
 */
export function useAllDocuments(limit = 50) {
  const storyboards = useDocumentsOfKind('storyboard', limit);
  const timelines = useDocumentsOfKind('timeline', limit);
  const sketches = useDocumentsOfKind('sketch', limit);

  const documents = useMemo(
    () =>
      [
        ...(storyboards.data ?? []),
        ...(timelines.data ?? []),
        ...(sketches.data ?? []),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [storyboards.data, timelines.data, sketches.data]
  );

  const queries = [storyboards, timelines, sketches];

  return {
    documents,
    isLoading: queries.some((query) => query.isLoading),
    isRefetching: queries.some((query) => query.isRefetching),
    // Surface the first failure; the browser shows one banner, not three.
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => {
      for (const query of queries) {
        void query.refetch();
      }
    },
  };
}

/** Create a document of a kind and invalidate that kind's list. */
export function useCreateDocument() {
  const utils = trpc.useUtils();
  return trpc.resources.create.useMutation({
    onSuccess: (detail) => {
      void utils.resources.list.invalidate({ kind: detail.ref.kind });
    },
  });
}

export function useRenameDocument() {
  const utils = trpc.useUtils();
  return trpc.resources.update.useMutation({
    onSuccess: (detail) => {
      void utils.resources.list.invalidate({ kind: detail.ref.kind });
      void utils.resources.read.invalidate({ ref: { kind: detail.ref.kind, id: detail.ref.id } });
    },
  });
}

export function useDeleteDocument() {
  const utils = trpc.useUtils();
  return trpc.resources.delete.useMutation({
    onSuccess: (_result, variables) => {
      // The cached store would otherwise keep serving a document that no
      // longer exists if the same id were somehow reopened.
      disposeDocumentStore(variables.ref.kind, variables.ref.id);
      void utils.resources.list.invalidate({ kind: variables.ref.kind });
    },
  });
}
