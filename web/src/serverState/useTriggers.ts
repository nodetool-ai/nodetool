/**
 * Server state for trigger registrations — backs the editor toolbar's
 * Activate toggle, the per-trigger status rows, and the armed badge on
 * workflow cards.
 *
 * Backed by `triggers.listByWorkflow` / `triggers.fire`
 * (`packages/websocket/src/trpc/routers/triggers.ts`) and
 * `jobs.triggersRunning` / `jobs.triggerStart` / `jobs.triggerStop`
 * (`packages/websocket/src/trpc/routers/jobs.ts`).
 *
 * `triggers.listByWorkflow` returns EVERY registration for the workflow
 * (enabled or not), scoped to the caller, including a webhook registration's
 * `webhook_token`/`webhook_secret` — so every trigger node has a discoverable
 * registration id and the Activate toggle can arm a trigger that has never
 * been enabled before.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import { BASE_URL, withApiBase } from "../stores/BASE_URL";
import { useNotificationStore } from "../stores/NotificationStore";
import { isString } from "../utils/typePredicates";

export interface TriggerRegistrationStatus {
  id: string;
  workflow_id: string;
  node_id: string;
  kind: string;
  enabled: boolean;
  last_fired_at: string | null;
  last_error: string | null;
  /** Non-null only for `kind === "webhook"`. */
  webhook_token: string | null;
  /** Non-null only for `kind === "webhook"`. Never the stored hash. */
  webhook_secret: string | null;
  /**
   * ISO timestamp of the next scheduled fire. Non-null only for
   * `kind === "schedule"`. Optional: older servers omit the field.
   */
  next_fire_at?: string | null;
  /**
   * Seconds between fires. Non-null only for `kind === "schedule"`.
   * Optional: older servers omit the field.
   */
  interval_seconds?: number | null;
  /**
   * Why the dispatcher disarmed this registration — `failures`, `expired` or
   * `max_runs`. Null when it is armed, or when a person switched it off.
   * Optional: older servers omit the field.
   */
  disabled_reason?: string | null;
  /** Failed runs since the last success. Optional: older servers omit it. */
  consecutive_failures?: number;
}

/** A registration as `jobs.triggersRunning` returns it — no webhook secrets. */
export interface RunningTriggerRegistration {
  id: string;
  workflow_id: string;
  node_id: string;
  kind: string;
  enabled: boolean;
  last_fired_at: string | null;
  last_error: string | null;
  disabled_reason?: string | null;
}

export const triggersQueryKey = (workflowId: string) =>
  ["triggers", workflowId] as const;

/** Key for the caller's enabled registrations across every workflow. */
export const runningTriggersQueryKey = ["triggers", "by-user", "running"] as const;

/** How long the cross-workflow armed list stays fresh. */
const RUNNING_TRIGGERS_STALE_MS = 30_000;

export interface UseWorkflowTriggersOptions {
  /** Gate the query — pass whether the open graph actually has trigger nodes. */
  enabled?: boolean;
}

/** Every trigger registration for the workflow, enabled or not. */
export const useWorkflowTriggers = (
  workflowId: string | null | undefined,
  options: UseWorkflowTriggersOptions = {}
) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: workflowId
      ? triggersQueryKey(workflowId)
      : triggersQueryKey("none"),
    queryFn: async (): Promise<TriggerRegistrationStatus[]> => {
      const { triggers } = await trpcClient.triggers.listByWorkflow.query({
        workflowId: workflowId as string
      });
      return triggers;
    },
    enabled: enabled && !!workflowId
  });
};

/**
 * The caller's enabled registrations across all workflows. One query backs
 * every workflow card, so a list of 50 cards still makes a single request.
 */
export const useRunningTriggers = (options: { enabled?: boolean } = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: runningTriggersQueryKey,
    queryFn: async (): Promise<RunningTriggerRegistration[]> => {
      const { triggers } = await trpcClient.jobs.triggersRunning.query();
      return triggers;
    },
    staleTime: RUNNING_TRIGGERS_STALE_MS,
    enabled
  });
};

/** Human-readable text for whatever a tRPC mutation rejected with. */
export const triggerErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (isString(error) && error) return error;
  return "Unknown error";
};

/** Enable or disable a single registration by id. */
export const useSetTriggerEnabled = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? trpcClient.jobs.triggerStart.mutate({ id })
        : trpcClient.jobs.triggerStop.mutate({ id }),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(workflowId) });
      }
      queryClient.invalidateQueries({ queryKey: runningTriggersQueryKey });
    },
    onError: (error: unknown, variables: { id: string; enabled: boolean }) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not ${
          variables.enabled ? "activate" : "deactivate"
        } trigger: ${triggerErrorMessage(error)}`
      });
      if (workflowId) {
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(workflowId) });
      }
    }
  });
};

/** "Fire now" — deliver one event to an already-enabled registration. */
export const useFireTrigger = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  return useMutation({
    mutationFn: (opts: {
      registrationId: string;
      payload?: unknown;
      idempotencyKey?: string;
    }) => trpcClient.triggers.fire.mutate(opts),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(workflowId) });
      }
    },
    onError: (error: unknown) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not fire trigger: ${triggerErrorMessage(error)}`
      });
    }
  });
};

/**
 * The webhook delivery URL a sender POSTs events to.
 *
 * The user pastes this into an external service, so it must be absolute. When
 * `VITE_API_URL` is set (Electron, or a build pointing at api.nodetool.ai)
 * that is the host serving `/api/webhooks`. Without it — local dev behind the
 * Vite proxy — the page's own origin is the right host.
 */
export const webhookDeliveryUrl = (webhookToken: string): string => {
  const path = `/api/webhooks/${webhookToken}`;
  if (BASE_URL) return withApiBase(path);
  return typeof window === "undefined"
    ? path
    : `${window.location.origin}${path}`;
};
