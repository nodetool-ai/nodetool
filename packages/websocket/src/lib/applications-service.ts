/**
 * Application service — the business logic behind both transports.
 *
 * The tRPC `applications` router and the `/api/applications` REST routes are
 * two doors onto these functions, so an app looks the same whichever one a
 * client comes through. Errors are raised with `throwApiError`, which the REST
 * layer maps back to a status code.
 */

import { z } from "zod";
import {
  applyBundle,
  bundleFromApplication,
  createEmptyDocument,
  operationTarget,
  parseApplicationBundle,
  parseApplicationDocument,
  pinScriptVersions,
  type ApplicationDocument,
  type BundleJsScriptSource,
  type BundleWorkflowSource
} from "@nodetool-ai/app-runtime";
import {
  Application,
  ApplicationIdInUseError,
  InvalidApplicationIdError,
  JsScript,
  JsScriptVersion,
  Workflow,
  createJsScriptResolver,
  createStableUuid,
  createTimeOrderedUuid,
  normalizeApplicationId,
  releasedApplicationRelease
} from "@nodetool-ai/models";
import {
  applicationBundle,
  applicationReleaseResponse,
  applicationResponse,
  patchApplicationInput,
  type ApplicationBundleSchema,
  type ApplicationListItem,
  type ApplicationReleaseResponse,
  type ApplicationResponse,
  type CreateApplicationInput,
  type ImportApplicationBundleInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

export const listApplicationsInput = z.object({
  projectId: z.string().optional()
});

export const applicationIdInput = z.object({ id: z.string() });

export const updateApplicationInput = patchApplicationInput.and(
  z.object({ id: z.string(), baseUpdatedAt: z.string().optional() })
);
export type UpdateApplicationInput = z.infer<typeof updateApplicationInput>;

export function toListItem(app: Application): ApplicationListItem {
  return {
    id: app.id,
    projectId: app.project_id,
    name: app.name,
    description: app.description,
    operationCount: app.toDocument().operations.length,
    updatedAt: app.updated_at
  };
}

/** The `app_doc` JSON column, which the `Workflow` model does not declare. */
interface AppDocColumn {
  app_doc?: unknown;
}

export async function loadOwnedApplication(
  userId: string | null,
  id: string
): Promise<Application> {
  if (!userId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const app = await Application.findById(id);
  if (!app || app.user_id !== userId) {
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
  // SAFETY: `app_doc` is a JSON column the `Workflow` model does not declare.
  const raw: unknown = (workflow as AppDocColumn).app_doc;
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

export async function listApplications(
  userId: string,
  projectId?: string
): Promise<ApplicationListItem[]> {
  const apps = projectId
    ? await Application.listByProject(projectId, userId)
    : await Application.listByUser(userId);
  return apps.map(toListItem);
}

export async function getApplication(
  userId: string,
  id: string
): Promise<ApplicationResponse> {
  const app = await loadOwnedApplication(userId, id);
  return applicationResponse.parse(app.toResponse());
}

/**
 * Create the row, mapping the model's id errors onto API errors.
 *
 * Ids are global: an app the caller does not own occupies its id just as much
 * as one they do, and the row it names is reported the same way a missing one
 * is — the caller learns their id was refused, not who holds it.
 */
async function insertApplication(
  userId: string,
  data: Record<string, unknown>
): Promise<Application> {
  try {
    return await Application.createUnique(data);
  } catch (error) {
    if (error instanceof InvalidApplicationIdError) {
      throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid application id");
    }
    if (error instanceof ApplicationIdInUseError) {
      // The id was taken between the caller's existence check and this insert.
      // Answer exactly as that check would have: the owner gets their app back
      // so a retried create stays idempotent, and everyone else gets the same
      // answer a missing id gets. Reporting "already exists" here would make
      // the losing side of the race the one place that reveals an id is held.
      const existing =
        typeof data.id === "string" ? await Application.findById(data.id) : null;
      if (existing && existing.user_id === userId) return existing;
      throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
    }
    throw error;
  }
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<ApplicationResponse> {
  let id: string | undefined;
  if (input.id) {
    try {
      id = normalizeApplicationId(input.id);
    } catch {
      throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid application id");
    }
    // Creating over an existing id is idempotent for its owner — a retried
    // create returns the same app — and refused for everyone else. The id must
    // never be reused, because the app's versions, ledger and budget are keyed
    // on it and a deleted app's children could otherwise be inherited.
    const existing = await Application.findById(id);
    if (existing) {
      if (existing.user_id !== userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
      }
      return applicationResponse.parse(existing.toResponse());
    }
  }
  const document =
    input.document ??
    (input.fromWorkflowId
      ? await documentFromWorkflow(input.fromWorkflowId, userId)
      : createEmptyDocument());
  const app = await insertApplication(userId, {
    id,
    user_id: userId,
    project_id: input.projectId,
    name: input.name,
    description: input.description,
    document: JSON.stringify(document)
  });
  return applicationResponse.parse(app.toResponse());
}

export async function updateApplication(
  userId: string,
  input: UpdateApplicationInput
): Promise<ApplicationResponse> {
  const app = await loadOwnedApplication(userId, input.id);

  // CAS on updated_at so the conflict check and the write are atomic.
  const expectedUpdatedAt = input.baseUpdatedAt ?? app.updated_at;
  if (input.baseUpdatedAt && app.updated_at !== input.baseUpdatedAt) {
    throwApiError(
      ApiErrorCode.ALREADY_EXISTS,
      "Application was modified since last read (optimistic concurrency conflict)"
    );
  }

  const fields: Parameters<typeof Application.updateFieldsIfUnchanged>[2] = {};
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
}

/**
 * Delete the app together with its versions, ledger and budget.
 *
 * `Application.delete` is the cascade: the child tables carry no owner check
 * of their own, so leaving a row behind hands it to whoever next claims this
 * id — an id a client is free to name.
 */
export async function deleteApplication(
  userId: string,
  id: string
): Promise<{ ok: true }> {
  const app = await loadOwnedApplication(userId, id);
  await app.delete();
  return { ok: true as const };
}

/**
 * Export an app as an {@link ApplicationBundle}: the document plus the full
 * graph of every workflow its operations bind, with the operations rewritten
 * to bundle-local keys.
 *
 * With `released`, the bundle carries the released snapshot and the graphs the
 * release pinned, so a published app exports reproducibly; otherwise it carries
 * the draft and the workflows' live graphs. A workflow an operation binds but
 * that no longer exists is left out — the operation keeps its raw id, so the
 * broken link stays visible instead of silently disappearing.
 */
export async function exportApplicationBundle(
  userId: string,
  id: string,
  options: { released?: boolean } = {}
): Promise<ApplicationBundleSchema> {
  const app = await loadOwnedApplication(userId, id);
  const release = options.released
    ? await releasedApplicationRelease(id, userId)
    : null;
  if (options.released && !release) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Application has no released version");
  }
  const document = release ? release.document : app.toDocument();
  const pinned = new Map(
    (release?.workflows ?? []).map((entry) => [entry.workflowId, entry])
  );

  const sources: BundleWorkflowSource[] = [];
  const scriptSources: BundleJsScriptSource[] = [];
  const seen = new Set<string>();
  const seenScripts = new Set<string>();
  for (const operation of document.operations) {
    const target = operationTarget(operation);
    if (target.kind === "script") {
      if (seenScripts.has(target.scriptId)) continue;
      seenScripts.add(target.scriptId);
      // The pinned version is what the app runs, so that is what ships — not
      // whatever the script has drifted to since.
      const resolved = await createJsScriptResolver().resolve(
        { id: target.scriptId, version: target.scriptVersion },
        userId
      );
      // A script the operation pins but the install no longer has is left out,
      // the way a missing workflow is: the broken link stays visible.
      if (!resolved) continue;
      scriptSources.push({
        scriptId: target.scriptId,
        name: resolved.name,
        document: resolved.document,
        sourceId: target.scriptId,
        version: target.scriptVersion
      });
      continue;
    }
    if (seen.has(operation.workflowId)) continue;
    seen.add(operation.workflowId);
    const pin = pinned.get(operation.workflowId);
    const workflow = await Workflow.find(userId, operation.workflowId);
    const graph = pin?.graph ?? workflow?.getGraph();
    if (!graph) continue;
    sources.push({
      workflowId: operation.workflowId,
      name: workflow?.name ?? operation.name,
      description: workflow?.description ?? "",
      graph,
      version: pin?.version ?? null,
      graphHash: pin?.graphHash ?? null
    });
  }

  return applicationBundle.parse(
    bundleFromApplication(
      { name: app.name, description: app.description, document },
      sources,
      scriptSources
    )
  );
}

/**
 * Import an {@link ApplicationBundle}: create a workflow row per carried
 * workflow, then the application with its operations pointing at the new ids.
 *
 * Workflows are written first so the app never references a row that does not
 * exist yet.
 *
 * **Dedupe rule.** A carried workflow that declares a `sourceId` gets a row id
 * derived from that source and the importing user, so importing the same
 * source twice lands on the same row: the second import reuses what the first
 * created rather than duplicating it. That is what keeps two example apps
 * binding the same template — Photo Studio and Concept Studio both bind Image
 * Enhance — down to one workflow. A workflow with no `sourceId` (a
 * hand-exported bundle) always gets a fresh id, so importing a colleague's app
 * never silently attaches to a workflow you already have.
 */
export async function importApplicationBundle(
  userId: string,
  input: ImportApplicationBundleInput
): Promise<ApplicationResponse> {
  const bundle = parseApplicationBundle(input.bundle);
  if (!bundle) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid application bundle");
  }
  const result = applyBundle(bundle, {
    newWorkflowId: (workflow) =>
      workflow.sourceId
        ? createStableUuid(userId, workflow.sourceId)
        : createTimeOrderedUuid(),
    newScriptId: (script) =>
      script.sourceId
        ? createStableUuid(userId, script.sourceId)
        : createTimeOrderedUuid()
  });

  for (const workflow of result.workflows) {
    if (workflow.sourceId && (await Workflow.find(userId, workflow.id))) {
      continue;
    }
    await Workflow.create<Workflow>({
      id: workflow.id,
      user_id: userId,
      name: workflow.name,
      description: workflow.description ?? "",
      access: "private",
      graph: workflow.graph
    });
  }

  // A script row has its own version numbering, so the number the export
  // pinned means nothing here: every carried script is snapshotted and the
  // operations are re-pinned to the version this install created.
  const scriptVersions = new Map<string, number>();
  for (const script of result.scripts) {
    const existing = await JsScript.findById(script.id);
    const row =
      existing && existing.user_id === userId
        ? existing
        : new JsScript({
            id: script.id,
            user_id: userId,
            project_id: input.projectId,
            name: script.name,
            document: JSON.stringify(script.document)
          });
    if (row !== existing) await row.save();
    const version = await JsScriptVersion.snapshot(row, {
      saveType: "manual",
      name: `Imported with ${result.app.name}`
    });
    scriptVersions.set(script.id, version.version);
  }

  const document =
    scriptVersions.size > 0
      ? pinScriptVersions(result.app.document, scriptVersions)
      : result.app.document;

  const app = await insertApplication(userId, {
    user_id: userId,
    project_id: input.projectId,
    name: result.app.name,
    description: result.app.description,
    document: JSON.stringify(document)
  });
  return applicationResponse.parse(app.toResponse());
}

/**
 * What a published app should run: the released snapshot's document, its
 * version number and capabilities, plus the graph each operation is pinned to.
 */
export async function releasedApplicationDocument(
  userId: string,
  id: string
): Promise<ApplicationReleaseResponse | null> {
  await loadOwnedApplication(userId, id);
  const release = await releasedApplicationRelease(id, userId);
  return release ? applicationReleaseResponse.parse(release) : null;
}
