/**
 * Applications router — tRPC.
 *
 * An application is a mini app's own record: a UI document plus typed bindings
 * to workflow operations, resources, and variables. Legacy apps live on
 * `workflow.app_doc`; `create({ fromWorkflowId })` imports one, binding the
 * host workflow as the app's first operation.
 *
 * Procedures:
 *   list     (query)    — ApplicationListItem[]
 *   get      (query)    — ApplicationResponse
 *   create   (mutation) — ApplicationResponse
 *   update   (mutation) — ApplicationResponse (CAS via baseUpdatedAt)
 *   delete   (mutation) — { ok: true }
 *   publish  (mutation) — ApplicationVersionResponse
 *   versions (query)    — ApplicationVersionResponse[]
 *   release  (mutation) — ApplicationVersionResponse (publish or rollback)
 *   released (query)    — ApplicationVersionResponse | null
 *   releasedDocument (query) — ApplicationReleaseResponse | null
 *                              (the snapshot plus the graphs it is pinned to)
 *
 * Public deployment, for an app shared by URL rather than by account:
 *   deployment/deploy/undeploy — the hidden link the release is served from
 *
 * Spend governance, for apps published to people other than their author:
 *   budget/setBudget       — the app-scoped ceiling
 *   usage                  — spend in the budget's current window
 *   beginInvocation        — check the budget, then record the run
 *   settleInvocation       — close the run out at its actual cost
 *   invocations            — the release telemetry ledger
 */

import { z } from "zod";
import {
  applicationUsage,
  getApplicationBudget,
  listApplicationVersions,
  listInvocations,
  publishApplication,
  reserveInvocation,
  releaseApplicationVersion,
  releasedApplicationVersion,
  setApplicationBudget,
  settleInvocation
} from "@nodetool-ai/models";
import {
  applicationBudget,
  applicationDeployment,
  applicationListItem,
  applicationReleaseResponse,
  applicationResponse,
  applicationUsage as applicationUsageSchema,
  applicationVersionResponse,
  beginInvocationInput,
  createApplicationInput,
  invocationRecord,
  setApplicationBudgetInput,
  settleInvocationInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  applicationIdInput as idInput,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  listApplicationsInput as listInput,
  loadOwnedApplication as loadOwned,
  releasedApplicationDocument,
  updateApplication,
  updateApplicationInput as updateInput
} from "../../lib/applications-service.js";
import {
  deployApplication,
  getApplicationDeployment,
  undeployApplication
} from "../../lib/app-deployment-service.js";

const okOutput = z.object({ ok: z.literal(true) });

export const applicationsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(applicationListItem))
    .query(({ ctx, input }) => listApplications(ctx.userId, input.projectId)),

  get: protectedProcedure
    .input(idInput)
    .output(applicationResponse)
    .query(({ ctx, input }) => getApplication(ctx.userId, input.id)),

  create: protectedProcedure
    .input(createApplicationInput)
    .output(applicationResponse)
    .mutation(({ ctx, input }) => createApplication(ctx.userId, input)),

  update: protectedProcedure
    .input(updateInput)
    .output(applicationResponse)
    .mutation(({ ctx, input }) => updateApplication(ctx.userId, input)),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(({ ctx, input }) => deleteApplication(ctx.userId, input.id)),

  publish: protectedProcedure
    .input(idInput)
    .output(applicationVersionResponse)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      return applicationVersionResponse.parse(await publishApplication(app));
    }),

  versions: protectedProcedure
    .input(idInput)
    .output(z.array(applicationVersionResponse))
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const versions = await listApplicationVersions(
        input.id,
        undefined,
        ctx.userId
      );
      return versions.map((v) => applicationVersionResponse.parse(v));
    }),

  released: protectedProcedure
    .input(idInput)
    .output(applicationVersionResponse.nullable())
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const version = await releasedApplicationVersion(input.id, ctx.userId);
      return version ? applicationVersionResponse.parse(version) : null;
    }),

  /**
   * What a published app should run: the released snapshot's document, its
   * version number and capabilities, plus the graph each operation is pinned
   * to. A client that runs these graphs runs the release; a client that runs
   * the app's `document` runs the draft.
   */
  releasedDocument: protectedProcedure
    .input(idInput)
    .output(applicationReleaseResponse.nullable())
    .query(({ ctx, input }) => releasedApplicationDocument(ctx.userId, input.id)),

  /**
   * The app's hidden-URL deployment, or null when it has none. Only the owner
   * ever sees the token; the visitor presents it, and gets back the release.
   * Production-only, so a local editor asking this gets a refusal rather than
   * a link that stops working when it matters.
   */
  deployment: protectedProcedure
    .input(idInput)
    .output(applicationDeployment.nullable())
    .query(({ ctx, input }) =>
      getApplicationDeployment(ctx.userId, input.id)
    ),

  deploy: protectedProcedure
    .input(idInput)
    .output(applicationDeployment)
    .mutation(({ ctx, input }) => deployApplication(ctx.userId, input.id)),

  undeploy: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(({ ctx, input }) => undeployApplication(ctx.userId, input.id)),

  budget: protectedProcedure
    .input(idInput)
    .output(applicationBudget.nullable())
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const budget = await getApplicationBudget(input.id);
      return budget ? applicationBudget.parse(budget) : null;
    }),

  setBudget: protectedProcedure
    .input(setApplicationBudgetInput)
    .output(applicationBudget)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const saved = await setApplicationBudget(input.id, {
        period: input.period,
        maxUsd: input.maxUsd,
        maxInvocations: input.maxInvocations
      });
      return applicationBudget.parse(saved);
    }),

  usage: protectedProcedure
    .input(idInput)
    .output(applicationUsageSchema)
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const budget = await getApplicationBudget(input.id);
      return applicationUsageSchema.parse(
        await applicationUsage(input.id, budget?.period ?? "total")
      );
    }),

  invocations: protectedProcedure
    .input(idInput)
    .output(z.array(invocationRecord))
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const records = await listInvocations(input.id, undefined, ctx.userId);
      return records.map((r) => invocationRecord.parse(r));
    }),

  /**
   * Reserve budget for a run. Call this before creating the job: an
   * over-budget run must fail with a typed error rather than reach a provider.
   */
  beginInvocation: protectedProcedure
    .input(beginInvocationInput)
    .output(invocationRecord)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const release = await releasedApplicationVersion(input.id, ctx.userId);
      // One transaction checks the budget and claims the run against it;
      // checking and then recording lets concurrent callers all read a total
      // that excludes each other and all be admitted.
      const decision = await reserveInvocation({
        applicationId: input.id,
        version: release?.version ?? null,
        invocationId: input.invocationId,
        operationId: input.operationId,
        estimatedUsd: input.estimatedUsd
      });
      if (!decision.allowed) {
        throwApiError(ApiErrorCode.BUDGET_EXCEEDED, decision.reason);
      }
      return invocationRecord.parse(decision.record);
    }),

  /**
   * Close a run out with what it actually cost. `loadOwned` authorizes the
   * application, and the settle itself is scoped to that application, so an
   * invocation id belonging to someone else's app settles nothing.
   */
  settleInvocation: protectedProcedure
    .input(settleInvocationInput)
    .output(invocationRecord.nullable())
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const settled = await settleInvocation(
        input.id,
        input.invocationId,
        input.actualUsd,
        input.status
      );
      return settled ? invocationRecord.parse(settled) : null;
    }),

  release: protectedProcedure
    .input(z.object({ id: z.string(), version: z.number() }))
    .output(applicationVersionResponse)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const released = await releaseApplicationVersion(
        input.id,
        input.version,
        ctx.userId
      );
      if (!released) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application version not found");
      }
      return applicationVersionResponse.parse(released);
    })
});
