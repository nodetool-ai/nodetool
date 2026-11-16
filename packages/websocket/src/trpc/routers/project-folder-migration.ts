/**
 * Project folder migration router — tRPC, nested as `projects.migration`.
 *
 * The client shows the plan, the user confirms, and the client follows the
 * progress. Every transition is checked by the migration service, never by
 * the client. See docs/project-folders/migration-ux.md.
 *
 * Procedures:
 *   status  (query)    — ProjectFolderMigrationStatus
 *   plan    (mutation) — ProjectFolderMigrationPlan (moves not_started to plan_shown)
 *   confirm (mutation) — ProjectFolderMigrationStatus (stores the location, starts)
 *   pause   (mutation) — ProjectFolderMigrationStatus
 *   resume  (mutation) — ProjectFolderMigrationStatus
 *   retry   (mutation) — ProjectFolderMigrationStatus
 *   dismiss (mutation) — ProjectFolderMigrationStatus
 */
import {
  projectFolderMigrationLocationInput,
  projectFolderMigrationPlan,
  projectFolderMigrationStatus
} from "@nodetool-ai/protocol/api-schemas/projects.js";
import {
  ProjectFolderMigrationError,
  confirmMigration,
  dismissMigration,
  getMigrationStatus,
  pauseMigration,
  resumeMigration,
  retryMigration,
  showMigrationPlan
} from "@nodetool-ai/project-services/project-folder-migration";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const ERROR_CODES = {
  invalid_transition: ApiErrorCode.INVALID_INPUT,
  invalid_location: ApiErrorCode.INVALID_INPUT,
  not_applicable: ApiErrorCode.FORBIDDEN
} as const;

/** Run a migration request, answering its refusals as API errors. */
async function withMigrationErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ProjectFolderMigrationError) {
      throwApiError(ERROR_CODES[error.code], error.message);
    }
    throw error;
  }
}

export const projectFolderMigrationRouter = router({
  status: protectedProcedure
    .output(projectFolderMigrationStatus)
    .query(({ ctx }) => getMigrationStatus(ctx.userId)),

  plan: protectedProcedure
    .input(projectFolderMigrationLocationInput)
    .output(projectFolderMigrationPlan)
    .mutation(({ ctx, input }) =>
      withMigrationErrors(() => showMigrationPlan(ctx.userId, input?.location))
    ),

  confirm: protectedProcedure
    .input(projectFolderMigrationLocationInput)
    .output(projectFolderMigrationStatus)
    .mutation(({ ctx, input }) =>
      withMigrationErrors(() =>
        confirmMigration(ctx.userId, { location: input?.location })
      )
    ),

  pause: protectedProcedure
    .output(projectFolderMigrationStatus)
    .mutation(({ ctx }) => withMigrationErrors(() => pauseMigration(ctx.userId))),

  resume: protectedProcedure
    .output(projectFolderMigrationStatus)
    .mutation(({ ctx }) => withMigrationErrors(() => resumeMigration(ctx.userId))),

  retry: protectedProcedure
    .output(projectFolderMigrationStatus)
    .mutation(({ ctx }) => withMigrationErrors(() => retryMigration(ctx.userId))),

  dismiss: protectedProcedure
    .output(projectFolderMigrationStatus)
    .mutation(({ ctx }) => withMigrationErrors(() => dismissMigration(ctx.userId)))
});
