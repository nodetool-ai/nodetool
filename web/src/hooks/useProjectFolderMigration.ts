/**
 * tRPC hooks for the migration of projects from before project folders. The
 * server decides every transition. These hooks read the state and send what
 * the user chose. See docs/project-folders/migration-ux.md.
 */

import { useCallback, useEffect, useRef } from "react";

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

/**
 * The migration state, read again every two seconds while it is under way.
 * The project folders are read again whenever the state changes, because the
 * server creates them during the run.
 */
export const useProjectFolderMigrationStatus = () => {
  const query = trpc.projects.migration.status.useQuery(undefined, {
    staleTime: 10_000,
    retry: false,
    refetchInterval: (current) =>
      isUnderWay(current.state.data) ? MIGRATION_POLL_MS : false
  });
  const invalidateProjects = useInvalidateProjects();
  const state = query.data?.state;
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== state) {
      invalidateProjects();
    }
    previous.current = state;
  }, [state, invalidateProjects]);
  return query;
};

interface StatusHandlers {
  /** Store a status a mutation returned, and refresh the project folders. */
  onSuccess: (status: ProjectFolderMigrationStatus) => void;
  /**
   * Read the state again after a refusal. Another process, such as a
   * `nodetool projects migrate` command, may have changed it.
   */
  onError: () => void;
}

const useStatusHandlers = (): StatusHandlers => {
  const utils = trpc.useUtils();
  const invalidateProjects = useInvalidateProjects();
  const onSuccess = useCallback(
    (status: ProjectFolderMigrationStatus) => {
      utils.projects.migration.status.setData(undefined, status);
      invalidateProjects();
    },
    [invalidateProjects, utils]
  );
  const onError = useCallback(() => {
    void utils.projects.migration.status.invalidate();
  }, [utils]);
  return { onSuccess, onError };
};

/** Read the plan. The first read records that the plan was shown. */
export const useProjectFolderMigrationPlan = () =>
  trpc.projects.migration.plan.useMutation();

export const useConfirmProjectFolderMigration = () => {
  const handlers = useStatusHandlers();
  return trpc.projects.migration.confirm.useMutation(handlers);
};

export const usePauseProjectFolderMigration = () => {
  const handlers = useStatusHandlers();
  return trpc.projects.migration.pause.useMutation(handlers);
};

export const useResumeProjectFolderMigration = () => {
  const handlers = useStatusHandlers();
  return trpc.projects.migration.resume.useMutation(handlers);
};

export const useRetryProjectFolderMigration = () => {
  const handlers = useStatusHandlers();
  return trpc.projects.migration.retry.useMutation(handlers);
};

export const useDismissProjectFolderMigration = () => {
  const handlers = useStatusHandlers();
  return trpc.projects.migration.dismiss.useMutation(handlers);
};
