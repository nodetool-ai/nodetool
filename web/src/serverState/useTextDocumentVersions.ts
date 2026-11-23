/**
 * useTextDocumentVersions
 *
 * Server state for a Markdown document's stored versions
 * (`trpc.textDocuments.*`, document editor PRD R11): the list, one version's
 * content, and the save and restore mutations, which invalidate the list.
 * A restore rewrites the file, and the open editor takes it in through the
 * asset's `resource_change` like any outside write.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";
import type { RouterOutputs } from "../trpc/client";

export type TextDocumentVersionItem =
  RouterOutputs["textDocuments"]["versions"]["versions"][number];

export const textDocumentVersionsKey = (assetId: string) =>
  ["textDocuments", assetId, "versions"] as const;

export const textDocumentVersionKey = (assetId: string, version: number) =>
  ["textDocuments", assetId, "version", version] as const;

export interface UseTextDocumentVersionsResult {
  versions: TextDocumentVersionItem[];
  isLoading: boolean;
  error: unknown;
  saveVersion: (name?: string) => Promise<void>;
  isSaving: boolean;
  renameVersion: (version: number, name: string | null) => Promise<void>;
  isRenaming: boolean;
  deleteVersion: (version: number) => Promise<void>;
  isDeleting: boolean;
  restoreVersion: (version: number) => Promise<void>;
  isRestoring: boolean;
}

export function useTextDocumentVersions(
  assetId: string,
  enabled = true
): UseTextDocumentVersionsResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: textDocumentVersionsKey(assetId),
    queryFn: async () =>
      (await trpcClient.textDocuments.versions.query({ asset_id: assetId })).versions,
    enabled,
    staleTime: 10 * 1000
  });
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["textDocuments", assetId] }),
    [assetId, queryClient]
  );
  const save = useMutation({
    mutationFn: (name?: string) =>
      trpcClient.textDocuments.createVersion.mutate({
        asset_id: assetId,
        save_type: "manual",
        name: name?.trim() ? name.trim() : undefined
      }),
    onSuccess: invalidate
  });
  const rename = useMutation({
    mutationFn: ({ version, name }: { version: number; name: string | null }) =>
      trpcClient.textDocuments.renameVersion.mutate({
        asset_id: assetId,
        version,
        name: name?.trim() ? name.trim() : null
      }),
    onSuccess: invalidate
  });
  const remove = useMutation({
    mutationFn: (version: number) =>
      trpcClient.textDocuments.deleteVersion.mutate({
        asset_id: assetId,
        version
      }),
    onSuccess: invalidate
  });
  const restore = useMutation({
    mutationFn: (version: number) =>
      trpcClient.textDocuments.restore.mutate({ asset_id: assetId, version }),
    onSuccess: invalidate
  });
  return {
    versions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    saveVersion: async (name) => {
      await save.mutateAsync(name);
    },
    isSaving: save.isPending,
    renameVersion: async (version, name) => {
      await rename.mutateAsync({ version, name });
    },
    isRenaming: rename.isPending,
    deleteVersion: async (version) => {
      await remove.mutateAsync(version);
    },
    isDeleting: remove.isPending,
    restoreVersion: async (version) => {
      await restore.mutateAsync(version);
    },
    isRestoring: restore.isPending
  };
}

/** One version's Markdown, for the preview. */
export function useTextDocumentVersionContent(
  assetId: string,
  version: number | null
): { content: string | null; isLoading: boolean; error: unknown } {
  const query = useQuery({
    queryKey: textDocumentVersionKey(assetId, version ?? 0),
    queryFn: async () =>
      (await trpcClient.textDocuments.version.query({
        asset_id: assetId,
        version: version as number
      })).content,
    enabled: version !== null,
    staleTime: Infinity
  });
  return {
    content: query.data ?? null,
    isLoading: version !== null && (query.isLoading || (query.isPending && !query.error)),
    error: version !== null ? query.error : null
  };
}

/**
 * Record an interval version of the saved document. The server skips one
 * whose content equals the newest version.
 */
export async function saveAutosaveVersion(assetId: string): Promise<void> {
  await trpcClient.textDocuments.createVersion.mutate({
    asset_id: assetId,
    save_type: "autosave"
  });
}

/**
 * Record a pre-turn version before accepting a staged assistant proposal
 * (document editor PRD R11).
 */
export async function savePreTurnVersion(assetId: string): Promise<void> {
  await trpcClient.textDocuments.createVersion.mutate({
    asset_id: assetId,
    save_type: "agent_turn"
  });
}

export type TextDocumentReference =
  RouterOutputs["textDocuments"]["references"]["workflows"][number];

/** The workflows that reference the document (PRD R15). */
export function useTextDocumentReferences(
  assetId: string,
  enabled = true
): { workflows: TextDocumentReference[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["textDocuments", assetId, "references"] as const,
    queryFn: async () =>
      (await trpcClient.textDocuments.references.query({ asset_id: assetId })).workflows,
    enabled,
    staleTime: 30 * 1000
  });
  return { workflows: query.data ?? [], isLoading: query.isLoading };
}
