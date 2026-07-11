import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult
} from "@tanstack/react-query";
import { restFetch } from "../lib/rest-fetch";
import { trpcClient } from "../trpc/client";

/**
 * One enabled trigger registration for a workflow, as returned by
 * `GET /api/jobs/triggers/running`. `token` is present only for webhook
 * registrations (the public `POST /api/webhooks/:token` path segment).
 */
export interface TriggerRegistrationSummary {
  id: string;
  workflow_id: string;
  node_id: string;
  kind: string;
  enabled: boolean;
  last_fired_at: string | null;
  last_error: string | null;
  token: string | null;
}

interface TriggersResponse {
  triggers: TriggerRegistrationSummary[];
}

export const triggersQueryKey = (workflowId: string) =>
  ["triggers", workflowId] as const;

/**
 * `GET /api/jobs/triggers/running` returns every enabled registration owned by
 * the caller across all workflows; we filter to the one workflow the editor is
 * showing. Only enabled rows come back, so a non-empty result means the
 * workflow's triggers are active.
 */
const fetchWorkflowTriggers = async (
  workflowId: string
): Promise<TriggerRegistrationSummary[]> => {
  const response = await restFetch("/api/jobs/triggers/running");
  if (!response.ok) {
    throw new Error(`Failed to load triggers (${response.status})`);
  }
  const data = (await response.json()) as TriggersResponse;
  return (data.triggers ?? []).filter((t) => t.workflow_id === workflowId);
};

/**
 * Enabled trigger registrations for a workflow. Gated on `enabled` so the
 * request only fires for workflows whose graph actually contains trigger nodes.
 */
export const useTriggerStatus = (
  workflowId: string | null | undefined,
  enabled: boolean
): UseQueryResult<TriggerRegistrationSummary[], Error> =>
  useQuery({
    queryKey: triggersQueryKey(workflowId ?? "none"),
    queryFn: () => fetchWorkflowTriggers(workflowId as string),
    enabled: enabled && !!workflowId,
    staleTime: 15_000,
    refetchOnWindowFocus: false
  });

const setTriggersEnabled = async (
  workflowId: string,
  action: "start" | "stop"
): Promise<TriggerRegistrationSummary[]> => {
  const response = await restFetch(
    `/api/jobs/triggers/${encodeURIComponent(workflowId)}/${action}`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to ${action === "start" ? "activate" : "deactivate"} triggers (${
        response.status
      })`
    );
  }
  const data = (await response.json()) as TriggersResponse;
  return data.triggers ?? [];
};

/**
 * Activate (`start`) or deactivate (`stop`) every trigger registration for a
 * workflow. Invalidates the workflow's trigger status on settle.
 */
export const useSetTriggersActive = (
  workflowId: string | null | undefined
): UseMutationResult<TriggerRegistrationSummary[], Error, boolean> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) =>
      setTriggersEnabled(workflowId as string, active ? "start" : "stop"),
    onSettled: () => {
      if (workflowId) {
        void queryClient.invalidateQueries({
          queryKey: triggersQueryKey(workflowId)
        });
      }
    }
  });
};

export interface FireTriggerResult {
  job_id: string;
}

/**
 * Fire a single registration on demand via the `triggers.fire` tRPC mutation.
 * Resolves with the started job id.
 */
export const useFireTrigger = (): UseMutationResult<
  FireTriggerResult,
  Error,
  string
> =>
  useMutation({
    mutationFn: async (registrationId: string) => {
      const result = await trpcClient.triggers.fire.mutate({ registrationId });
      return result as FireTriggerResult;
    }
  });
