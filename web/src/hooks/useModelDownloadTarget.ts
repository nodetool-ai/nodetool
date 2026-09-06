import { useMemo } from "react";
import { useActiveWorker } from "./useWorkers";
import type { ModelScope } from "../stores/ModelManagerStore";

export interface ModelDownloadTarget {
  /** Where a model download must land for execution to see it. */
  scope: ModelScope;
  /** Human-readable destination: the worker's profile name or "this computer". */
  label: string;
}

/**
 * Resolve where model downloads currently land. With an attached worker,
 * nodes execute there, so models are needed on the worker volume — the same
 * rule the Model Manager applies to its downloads.
 */
export const useModelDownloadTarget = (): ModelDownloadTarget => {
  const activeWorker = useActiveWorker();

  return useMemo(
    () => ({
      scope: activeWorker ? "worker" : "local",
      label: activeWorker
        ? (activeWorker.profile_name ?? activeWorker.id)
        : "this computer"
    }),
    [activeWorker]
  );
};
