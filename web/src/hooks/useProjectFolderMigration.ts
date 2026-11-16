/**
 * tRPC hooks for the migration of projects from before project folders. The
 * server decides every transition. These hooks read the state and send what
 * the user chose. See docs/project-folders/migration-ux.md.
 */

import { useCallback } from "react";

import { trpc, type RouterOutputs } from "../trpc/client";
import { useInvalidateProjects } from "./useProjects";

export type ProjectFolderMigrationStatus =
  RouterOutputs["projects"]["migration"]["status"];
export type ProjectFolderMigrationPlan =
  RouterOutputs["projects"]["migration"]["plan"];

/** How often the status is read again while files move. */
const MIGRATION_POLL_MS = 2_000;

const isUnderWay = (status: ProjectFolderMigrationStatus | undefined): boolean =>
  status?.state === "confirmed" || status?.state === "running";

/** The migration state, read again every two seconds while it is under way. */
export const useProjectFolderMigrationStatus = () =>
  trpc.projects.migration.status.useQuery(undefined, {
    staleTime: 10_000,
    retry: false,
    refetchInterval: (query) =>
      isUnderWay(query.state.data) ? MIGRATION_POLL_MS : false
  });

/** Store a status a mutation returned, and refresh the project folders. */
const useOnStatus = (): ((status: ProjectFolderMigrationStatus) => void) => {
  const utils = trpc.useUtils();
  const invalidateProjects = useInvalidateProjects();
  return useCallback(
    (status: ProjectFolderMigrationStatus) => {
      utils.projects.migration.status.setData(undefined, status);
      invalidateProjects();
    },
    [invalidateProjects, utils]
  );
};

/** Read the plan. The first read records that the plan was shown. */
export const useProjectFolderMigrationPlan = () =>
  trpc.projects.migration.plan.useMutation();

export const useConfirmProjectFolderMigration = () => {
  const onSuccess = useOnStatus();
  return trpc.projects.migration.confirm.useMutation({ onSuccess });
};

export const usePauseProjectFolderMigration = () => {
  const onSuccess = useOnStatus();
  return trpc.projects.migration.pause.useMutation({ onSuccess });
};

export const useResumeProjectFolderMigration = () => {
  const onSuccess = useOnStatus();
  return trpc.projects.migration.resume.useMutation({ onSuccess });
};

export const useRetryProjectFolderMigration = () => {
  const onSuccess = useOnStatus();
  return trpc.projects.migration.retry.useMutation({ onSuccess });
};

export const useDismissProjectFolderMigration = () => {
  const onSuccess = useOnStatus();
  return trpc.projects.migration.dismiss.useMutation({ onSuccess });
};
