import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { useWorkers } from "./useWorkers";
import type { UnifiedModel } from "../stores/ApiTypes";

export interface WorkerCachedModelsResult {
  /** Keys of models cached on the active worker (`owner/repo` or `owner/repo/path`). */
  ids: Set<string>;
  /** True while the worker cache list has not resolved yet (worker attached, query pending). */
  isLoading: boolean;
}

const EMPTY_IDS = new Set<string>();

/**
 * Returns the set of repo IDs (and path-qualified keys) that are currently
 * cached on the active worker.  Empty set when no worker is attached.
 *
 * Key format mirrors getHfCacheKey: `owner/repo` or `owner/repo/path`.
 */
export const useWorkerCachedModels = (): WorkerCachedModelsResult => {
  const { activeWorker } = useWorkers();

  const { data, isLoading } = useQuery<UnifiedModel[]>({
    queryKey: ["worker-cached-models"],
    queryFn: () =>
      trpc.models.huggingfaceList.query({ scope: "worker" }) as Promise<
        UnifiedModel[]
      >,
    enabled: !!activeWorker,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });

  const ids = useMemo(() => {
    if (!activeWorker || !data) return EMPTY_IDS;
    const next = new Set<string>();
    for (const m of data) {
      const base = m.repo_id || m.id || "";
      if (!base) continue;
      next.add(m.path ? `${base}/${m.path}` : base);
    }
    return next;
  }, [activeWorker, data]);

  return { ids, isLoading: !!activeWorker && isLoading };
};

export const useWorkerCachedModelIds = (): Set<string> =>
  useWorkerCachedModels().ids;
