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
 * Spend governance, for apps published to people other than their author:
 *   budget/setBudget       — the app-scoped ceiling
 *   usage                  — spend in the budget's current window
 *   beginInvocation        — check the budget, then record the run
 *   settleInvocation       — close the run out at its actual cost
 *   invocations            — the release telemetry ledger
 */

import { z } from "zod";
import {
  createEmptyDocument,
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import {
  Application,
  applicationUsage,
  getApplicationBudget,
  listApplicationVersions,
  listInvocations,
  publishApplication,
  reserveInvocation,
  releaseApplicationVersion,
  releasedApplicationRelease,
  releasedApplicationVersion,
  setApplicationBudget,
  settleInvocation
} from "@nodetool-ai/models";
import { Workflow } from "@nodetool-ai/models";
import {
  applicationBudget,
  applicationListItem,
  applicationReleaseResponse,
  applicationResponse,
  applicationUsage as applicationUsageSchema,
  applicationVersionResponse,
  beginInvocationInput,
  createApplicationInput,
  invocationRecord,
  patchApplicationInput,
  setApplicationBudgetInput,
  settleInvocationInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const listInput = z.object({ projectId: z.string().optional() });
const idInput = z.object({ id: z.string() });
const okOutput = z.object({ ok: z.literal(true) });

const updateInput = patchApplicationInput.and(
  z.object({ id: z.string(), baseUpdatedAt: z.string().optional() })
);

function toListItem(app: Application) {
  return {
    id: app.id,
    projectId: app.project_id,
    name: app.name,
    description: app.description,
    operationCount: app.toDocument().operations.length,
    updatedAt: app.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<Application> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const app = await Application.findById(id);
  if (!app || app.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
  }
  return app;
}

/**
 * Import a legacy `workflow.app_doc` as an application document. The parser
 * lifts a `{ version, data }` payload into one operation bound to the host
 * workflow; widget bindings inside the UI keep their stored form and resolve
 * against the live graph at runtime.
 */
async function documentFromWorkflow(
  workflowId: string,
  userId: string
): Promise<ApplicationDocument> {
  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Workflow not found");
  }
  const raw = (workflow as unknown as { app_doc?: unknown }).app_doc;
  const parsed = raw
    ? parseApplicationDocument(
        typeof raw === "string" ? JSON.parse(raw) : raw,
        { hostWorkflowId: workflowId }
      )
    : null;
  if (parsed) return parsed;
  // No app document yet: start empty but still bound to the workflow, so the
  // app has something to run the moment a widget is placed.
  const empty = createEmptyDocument();
  empty.operations = [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return empty;
}

export const applicationsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(applicationListItem))
    .query(async ({ ctx, input }) => {
      const apps = input.projectId
        ? await Application.listByProject(input.projectId, ctx.userId)
        : await Application.listByUser(ctx.userId);
      return apps.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(applicationResponse)
    .query(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      return applicationResponse.parse(app.toResponse());
    }),

  create: protectedProcedure
    .input(createApplicationInput)
    .output(applicationResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Application.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
          }
          return applicationResponse.parse(existing.toResponse());
        }
      }
      const document =
        input.document ??
        (input.fromWorkflowId
          ? await documentFromWorkflow(input.fromWorkflowId, ctx.userId)
          : createEmptyDocument());
      const app = new Application({
        id: input.id,
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        description: input.description,
        document: JSON.stringify(document)
      });
      await app.save();
      return applicationResponse.parse(app.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(applicationResponse)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);

      // CAS on updated_at so the conflict check and the write are atomic.
      const expectedUpdatedAt = input.baseUpdatedAt ?? app.updated_at;
      if (input.baseUpdatedAt && app.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Application was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<
        typeof Application.updateFieldsIfUnchanged
      >[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.description !== undefined) fields.description = input.description;
      if (input.document !== undefined) {
        fields.document = JSON.stringify(input.document);
      }

      const updated = await Application.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Application was modified since last read (optimistic concurrency conflict)"
        );
      }
      return applicationResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      await app.delete();
      return { ok: true as const };
    }),

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
      const versions = await listApplicationVersions(input.id);
      return versions.map((v) => applicationVersionResponse.parse(v));
    }),

  released: protectedProcedure
    .input(idInput)
    .output(applicationVersionResponse.nullable())
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const version = await releasedApplicationVersion(input.id);
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
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const release = await releasedApplicationRelease(input.id);
      return release ? applicationReleaseResponse.parse(release) : null;
    }),

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
      const records = await listInvocations(input.id);
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
      const release = await releasedApplicationVersion(input.id);
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

  /** Close a run out with what it actually cost. */
  settleInvocation: protectedProcedure
    .input(settleInvocationInput)
    .output(invocationRecord.nullable())
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const settled = await settleInvocation(
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
      const released = await releaseApplicationVersion(input.id, input.version);
      if (!released) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application version not found");
      }
      return applicationVersionResponse.parse(released);
    })
});
