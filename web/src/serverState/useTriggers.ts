/**
 * Server state for trigger registrations — backs the editor toolbar's
 * Activate toggle and per-trigger status rows.
 *
 * Backed by `triggers.listByWorkflow` / `triggers.fire`
 * (`packages/websocket/src/trpc/routers/triggers.ts`) and
 * `jobs.triggerStart` / `jobs.triggerStop`
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
}

export const triggersQueryKey = (workflowId: string) =>
  ["triggers", workflowId] as const;

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

/** Enable or disable a single registration by id (the Activate toggle). */
export const useSetTriggerEnabled = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled
        ? trpcClient.jobs.triggerStart.mutate({ id })
        : trpcClient.jobs.triggerStop.mutate({ id }),
    onSuccess: () => {
      if (workflowId) {
        queryClient.invalidateQueries({ queryKey: triggersQueryKey(workflowId) });
      }
    }
  });
};

/** "Fire now" — deliver one event to an already-enabled registration. */
export const useFireTrigger = (workflowId: string | null | undefined) => {
  const queryClient = useQueryClient();
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
    }
  });
};

/** The webhook delivery URL a sender POSTs events to. */
export const webhookDeliveryUrl = (webhookToken: string): string =>
  `${window.location.origin}/api/webhooks/${webhookToken}`;
