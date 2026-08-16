/**
 * Resources router — one envelope over the resource kinds a mini app can bind.
 *
 * The persistent layer already exists: `assets`, `timeline_sequences`,
 * `storyboards`, and `image_documents` each have their own model, router, web
 * store, and agent bridge. What was missing is a common shape an app can bind
 * to without knowing which of the four it is talking to. These providers wrap
 * those models; they do not replace the sibling routers, and a dedicated editor
 * keeps using its own.
 *
 * Every write carries the `revision` the caller read. A write whose revision is
 * behind the row is rejected rather than applied, so a gallery, picker, or clip
 * strip in a running app cannot silently clobber a concurrent edit.
 */

import { z } from "zod";
import {
  Asset,
  ImageDocument,
  Storyboard,
  TimelineSequence
} from "@nodetool-ai/models";
import type { ResourceKind } from "@nodetool-ai/app-runtime";
import {
  createResourceInput,
  deleteResourceInput,
  listResourcesInput,
  readResourceInput,
  resourceDetail,
  resourceSummary,
  updateResourceInput,
  type ResourceDetail,
  type ResourceSummary
} from "@nodetool-ai/protocol/api-schemas/resources.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

/**
 * What every provider implements. Documents are opaque here — the app layer
 * moves `ResourceRef`s around and hands the payload to a widget or a workflow;
 * it never interprets one.
 */
interface ResourceProvider {
  list(
    userId: string,
    projectId: string | undefined,
    limit: number
  ): Promise<ResourceSummary[]>;
  read(userId: string, id: string): Promise<ResourceDetail | null>;
  create(
    userId: string,
    name: string,
    projectId: string
  ): Promise<ResourceDetail>;
  update(
    userId: string,
    id: string,
    revision: number | undefined,
    fields: { name?: string; document?: unknown }
  ): Promise<ResourceDetail | "conflict" | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

/** Rows that carry a revision and a JSON document column. */
interface DocumentRow {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  document: string;
  revision: number;
  updated_at: string;
}

const toSummary = (kind: ResourceKind, row: DocumentRow): ResourceSummary => ({
  ref: { kind, id: row.id, revision: row.revision },
  name: row.name,
  projectId: row.project_id,
  contentType: null,
  updatedAt: row.updated_at
});

const toDetail = (kind: ResourceKind, row: DocumentRow): ResourceDetail => ({
  ...toSummary(kind, row),
  document: JSON.parse(row.document)
});

/**
 * Build a provider for one of the three document kinds. They differ only in
 * which model class they call, so the envelope is shared.
 */
function documentProvider(
  kind: Exclude<ResourceKind, "asset">,
  model: {
    findById(id: string): Promise<DocumentRow | null>;
    listByProject(
      projectId: string,
      userId: string,
      limit: number
    ): Promise<DocumentRow[]>;
    listByUser(userId: string, limit: number): Promise<DocumentRow[]>;
    create(data: Record<string, unknown>): Promise<DocumentRow>;
    updateFieldsIfUnchanged(
      id: string,
      expectedUpdatedAt: string,
      fields: Record<string, unknown>
    ): Promise<DocumentRow | null>;
  }
): ResourceProvider {
  /** Load a row the user owns, or null. */
  const owned = async (userId: string, id: string) => {
    const row = await model.findById(id);
    return row && row.user_id === userId ? row : null;
  };

  return {
    async list(userId, projectId, limit) {
      const rows = projectId
        ? await model.listByProject(projectId, userId, limit)
        : await model.listByUser(userId, limit);
      return rows.map((row) => toSummary(kind, row));
    },
    async read(userId, id) {
      const row = await owned(userId, id);
      return row ? toDetail(kind, row) : null;
    },
    async create(userId, name, projectId) {
      const row = await model.create({
        user_id: userId,
        project_id: projectId,
        name
      });
      return toDetail(kind, row);
    },
    async update(userId, id, revision, fields) {
      const row = await owned(userId, id);
      if (!row) return null;
      // The ref the caller read is behind the row: someone else wrote first.
      if (revision !== undefined && revision !== row.revision) return "conflict";
      const patch: Record<string, unknown> = {};
      if (fields.name !== undefined) patch.name = fields.name;
      if (fields.document !== undefined) {
        patch.document = JSON.stringify(fields.document);
      }
      const updated = await model.updateFieldsIfUnchanged(
        id,
        row.updated_at,
        patch
      );
      return updated ? toDetail(kind, updated) : "conflict";
    },
    async delete(userId, id) {
      const row = await owned(userId, id);
      if (!row) return false;
      // SAFETY: every document row here extends the base model, which
      // defines `delete()`; only the generic `model` binding loses it.
      const remove = Reflect.get(row, "delete") as () => Promise<void>;
      await remove.call(row);
      return true;
    }
  };
}

/**
 * Assets are a flat library rather than a versioned document, so their
 * provider maps the envelope onto the asset record: the payload is its
 * metadata, and there is no revision to conflict on.
 */
const assetProvider: ResourceProvider = {
  async list(userId, _projectId, limit) {
    const [assets] = await Asset.paginate(userId, { limit });
    return assets.map((asset) => ({
      ref: { kind: "asset" as const, id: asset.id },
      name: asset.name,
      projectId: null,
      contentType: asset.content_type,
      updatedAt: asset.updated_at
    }));
  },
  async read(userId, id) {
    const asset = await Asset.find(userId, id);
    if (!asset) return null;
    return {
      ref: { kind: "asset", id: asset.id },
      name: asset.name,
      projectId: null,
      contentType: asset.content_type,
      updatedAt: asset.updated_at,
      document: asset.metadata ?? {}
    };
  },
  async create() {
    // Asset bytes arrive through the upload endpoint, not this envelope.
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "Assets are created by upload, not by the resource provider"
    );
  },
  async update(userId, id, _revision, fields) {
    const asset = await Asset.find(userId, id);
    if (!asset) return null;
    if (fields.name !== undefined) asset.name = fields.name;
    await asset.save();
    return {
      ref: { kind: "asset", id: asset.id },
      name: asset.name,
      projectId: null,
      contentType: asset.content_type,
      updatedAt: asset.updated_at,
      document: asset.metadata ?? {}
    };
  },
  async delete(userId, id) {
    const asset = await Asset.find(userId, id);
    if (!asset) return false;
    await asset.delete();
    return true;
  }
};

const providers: Record<ResourceKind, ResourceProvider> = {
  asset: assetProvider,
  timeline: documentProvider(
    "timeline",
    TimelineSequence as unknown as Parameters<typeof documentProvider>[1]
  ),
  storyboard: documentProvider(
    "storyboard",
    Storyboard as unknown as Parameters<typeof documentProvider>[1]
  ),
  sketch: documentProvider(
    "sketch",
    ImageDocument as unknown as Parameters<typeof documentProvider>[1]
  )
};

const notFound = (kind: ResourceKind): never =>
  throwApiError(ApiErrorCode.NOT_FOUND, `${kind} resource not found`);

const conflict = (kind: ResourceKind): never =>
  throwApiError(
    ApiErrorCode.ALREADY_EXISTS,
    `${kind} resource was modified since it was read (optimistic concurrency conflict)`
  );

export const resourcesRouter = router({
  list: protectedProcedure
    .input(listResourcesInput)
    .output(z.array(resourceSummary))
    .query(({ ctx, input }) =>
      providers[input.kind].list(ctx.userId, input.projectId, input.limit)
    ),

  read: protectedProcedure
    .input(readResourceInput)
    .output(resourceDetail)
    .query(async ({ ctx, input }) => {
      const found = await providers[input.ref.kind].read(
        ctx.userId,
        input.ref.id
      );
      return found ?? notFound(input.ref.kind);
    }),

  create: protectedProcedure
    .input(createResourceInput)
    .output(resourceDetail)
    .mutation(({ ctx, input }) =>
      providers[input.kind].create(ctx.userId, input.name, input.projectId)
    ),

  update: protectedProcedure
    .input(updateResourceInput)
    .output(resourceDetail)
    .mutation(async ({ ctx, input }) => {
      const result = await providers[input.ref.kind].update(
        ctx.userId,
        input.ref.id,
        input.ref.revision,
        { name: input.name, document: input.document }
      );
      if (result === null) return notFound(input.ref.kind);
      if (result === "conflict") return conflict(input.ref.kind);
      return result;
    }),

  delete: protectedProcedure
    .input(deleteResourceInput)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await providers[input.ref.kind].delete(
        ctx.userId,
        input.ref.id
      );
      if (!deleted) notFound(input.ref.kind);
      return { ok: true as const };
    })
});
