/**
 * tRPC hooks for mini apps (`trpc.applications.*`).
 *
 * Components may call the router directly; these wrappers exist so the cache
 * invalidation that has to follow each mutation lives in one place — publishing
 * moves both the version list and the released pointer, releasing moves the
 * released pointer, and a budget change moves usage.
 */

import { trpc } from "../trpc/client";

const LIST_STALE_TIME = 30_000;

/**
 * True when a mutation lost the `baseUpdatedAt` compare-and-set — the record
 * changed between the read and the write. The server maps that to a tRPC
 * CONFLICT; callers must tell the user their edit was not saved.
 */
export const isConcurrencyConflict = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  const { data } = error;
  return (
    typeof data === "object" &&
    data !== null &&
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
