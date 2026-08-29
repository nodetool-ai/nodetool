/**
 * tRPC hooks for mini apps (`trpc.applications.*`).
 *
 * Components may call the router directly; these wrappers exist so the cache
 * invalidation that has to follow each mutation lives in one place — publishing
 * moves both the version list and the released pointer, releasing moves the
 * released pointer, and a budget change moves usage.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  parseApplicationDocument,
  type OperationBinding
} from "@nodetool-ai/app-runtime";

import { trpc } from "../trpc/client";
import { fetchWorkflowById, workflowQueryKey } from "../serverState/useWorkflow";
import { isObjectLike } from "../utils/typePredicates";

const LIST_STALE_TIME = 30_000;
const WORKFLOW_STALE_TIME = 60_000;

/**
 * True when a mutation lost the `baseUpdatedAt` compare-and-set — the record
 * changed between the read and the write. The server maps that to a tRPC
 * CONFLICT; callers must tell the user their edit was not saved.
 */
export const isConcurrencyConflict = (error: unknown): boolean => {
  if (!isObjectLike(error) || !("data" in error)) {
    return false;
  }
  const { data } = error;
  return (
    isObjectLike(data) &&
    "code" in data &&
    data.code === "CONFLICT"
  );
};

/** All apps the user owns, optionally scoped to a project. */
export const useApplications = (projectId?: string) =>
  trpc.applications.list.useQuery(
    { projectId },
    { staleTime: LIST_STALE_TIME }
  );

/** One app with its full document. Idle until an id is available. */
export const useApplication = (id: string | null | undefined) =>
  trpc.applications.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id, staleTime: LIST_STALE_TIME }
  );

export const useCreateApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.create.useMutation({
    onSuccess: (created) => {
      utils.applications.get.setData({ id: created.id }, created);
      void utils.applications.list.invalidate();
    }
  });
};

export const useUpdateApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.update.useMutation({
    onSuccess: (updated) => {
      utils.applications.get.setData({ id: updated.id }, updated);
      void utils.applications.list.invalidate();
    }
  });
};

export const useDeleteApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.delete.useMutation({
    onSuccess: () => {
      void utils.applications.list.invalidate();
    }
  });
};

/** Versions of an app, newest first as the server returns them. */
export const useApplicationVersions = (id: string | null | undefined) =>
  trpc.applications.versions.useQuery({ id: id ?? "" }, { enabled: !!id });

/** The version currently serving traffic, or null when nothing is released. */
export const useReleasedApplicationVersion = (id: string | null | undefined) =>
  trpc.applications.released.useQuery({ id: id ?? "" }, { enabled: !!id });

/**
 * What a published app should actually run: the released snapshot's document
 * plus the workflow graphs it pinned. Null when nothing is released, which is
 * the signal to fall back to the mutable draft.
 */
export const useReleasedApplicationDocument = (id: string | null | undefined) =>
  trpc.applications.releasedDocument.useQuery(
    { id: id ?? "" },
    { enabled: !!id }
  );

export const usePublishApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.publish.useMutation({
    onSuccess: (version) => {
      void utils.applications.versions.invalidate({ id: version.applicationId });
      void utils.applications.released.invalidate({ id: version.applicationId });
    }
  });
};

/** Point the release at an existing version (rollback or roll-forward). */
export const useReleaseApplicationVersion = () => {
  const utils = trpc.useUtils();
  return trpc.applications.release.useMutation({
    onSuccess: (version) => {
      void utils.applications.versions.invalidate({ id: version.applicationId });
      void utils.applications.released.invalidate({ id: version.applicationId });
    }
  });
};

/**
 * The app's hidden-URL deployment, or null when it has none. Only offered in
 * production, so the query is expected to error elsewhere — callers read
 * `isError` as "this server does not deploy apps" rather than as a fault.
 */
export const useApplicationDeployment = (id: string | null | undefined) =>
  trpc.applications.deployment.useQuery(
    { id: id ?? "" },
    { enabled: !!id, retry: false }
  );

export const useDeployApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.deploy.useMutation({
    onSuccess: (deployment) => {
      utils.applications.deployment.setData(
        { id: deployment.applicationId },
        deployment
      );
    }
  });
};

export const useUndeployApplication = () => {
  const utils = trpc.useUtils();
  return trpc.applications.undeploy.useMutation({
    onSuccess: (_result, variables) => {
      utils.applications.deployment.setData({ id: variables.id }, null);
    }
  });
};

export const useApplicationBudget = (id: string | null | undefined) =>
  trpc.applications.budget.useQuery({ id: id ?? "" }, { enabled: !!id });

export const useSetApplicationBudget = () => {
  const utils = trpc.useUtils();
  return trpc.applications.setBudget.useMutation({
    onSuccess: (budget) => {
      utils.applications.budget.setData({ id: budget.applicationId }, budget);
      void utils.applications.usage.invalidate({ id: budget.applicationId });
    }
  });
};

/** Spend and invocation count inside the budget's current window. */
export const useApplicationUsage = (id: string | null | undefined) =>
  trpc.applications.usage.useQuery({ id: id ?? "" }, { enabled: !!id });

/** Recent runs of the released app, newest first. */
export const useApplicationInvocations = (id: string | null | undefined) =>
  trpc.applications.invocations.useQuery({ id: id ?? "" }, { enabled: !!id });

/**
 * One workflow an app's operations bind, as the app surface presents it: the
 * live workflow (name + graph, prefetched in the background), which operations
 * use it, and whether the current release pinned its graph.
 */
export interface LinkedWorkflow {
  workflowId: string;
  /** Live name, or the id while loading / when the workflow is gone. */
  name: string;
  /** Every operation of the app that runs this workflow. */
  operations: Array<{ id: string; name: string }>;
  /** Graph version the release froze, null when nothing is pinned. */
  pinnedVersion: number | null;
  /** True when the released snapshot carries a frozen graph for it. */
  isPinned: boolean;
  isLoading: boolean;
  /** Set when the workflow could not be loaded — a broken link. */
  error: Error | null;
}

const operationsOf = (document: unknown): OperationBinding[] =>
  parseApplicationDocument(document)?.operations ?? [];

/**
 * The workflows an app links, with their graphs fetched in the background.
 *
 * Graphs are read under the shared `["workflow", id]` key, so a link that the
 * app surface prefetched is already in cache when the user opens the workflow
 * in its own tab — the fetch happens once per workflow, not once per surface.
 * `enabled` is the app tab's focus: an app sitting in a background tab costs
 * nothing.
 */
export const useLinkedWorkflows = (
  applicationId: string | null | undefined,
  enabled = true
) => {
  const { data: application } = useApplication(applicationId);
  const { data: release } = useReleasedApplicationDocument(applicationId);

  const operations = useMemo(
    () => operationsOf(application?.document),
    [application?.document]
  );

  const workflowIds = useMemo(() => {
    const ids = new Set<string>();
    for (const operation of operations) {
      if (operation.workflowId) ids.add(operation.workflowId);
    }
    return [...ids].sort();
  }, [operations]);

  const results = useQueries({
    queries: workflowIds.map((id) => ({
      queryKey: workflowQueryKey(id),
      queryFn: () => fetchWorkflowById(id),
      enabled: enabled && Boolean(applicationId),
      staleTime: WORKFLOW_STALE_TIME,
      retry: false
    }))
  });

  const pins = useMemo(() => {
    const map = new Map<string, { version: number | null; pinned: boolean }>();
    for (const pinned of release?.workflows ?? []) {
      map.set(pinned.workflowId, {
        version: pinned.version ?? null,
        pinned: pinned.graph !== null && pinned.graph !== undefined
      });
    }
    return map;
  }, [release?.workflows]);

  const links = workflowIds.map((id, index) => {
    const result = results[index];
    const workflow = result?.data;
    const pin = pins.get(id);
    return {
      workflowId: id,
      name: workflow?.name || id,
      operations: operations
        .filter((operation) => operation.workflowId === id)
        .map((operation) => ({ id: operation.id, name: operation.name })),
      pinnedVersion: pin?.version ?? null,
      isPinned: pin?.pinned ?? false,
      isLoading: result?.isLoading ?? false,
      error: result?.error ?? null
    };
  });

  return { links, isLoading: results.some((result) => result.isLoading) };
};
