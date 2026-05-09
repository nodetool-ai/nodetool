/**
 * Sketch (image document) router — tRPC.
 *
 * Procedures:
 *   list        (query)    — ImageDocumentListItem[]
 *   get         (query)    — ImageDocumentResponse
 *   create      (mutation) — ImageDocumentResponse
 *   update      (mutation) — ImageDocumentResponse (optional baseUpdatedAt for optimistic concurrency)
 *   delete      (mutation) — { ok: true }
 *   versions:
 *     list        (query)    — LayerVersion[]
 *     append      (mutation) — LayerVersion
 *     setFavorite (mutation) — LayerVersion
 *     delete      (mutation) — { ok: true }
 *
 * Auth: every procedure uses `protectedProcedure`. Ownership is enforced by
 * comparing `doc.user_id` against `ctx.userId`.
 */

import { z } from "zod";
import { ImageDocument, createTimeOrderedUuid } from "@nodetool-ai/models";
import type { ImageDocumentData } from "@nodetool-ai/models";
import {
  appendLayerVersionInput,
  createImageDocumentInput,
  imageDocumentListItem,
  imageDocumentResponse,
  layerVersion,
  patchImageDocumentInput
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import type { LayerVersion } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

// ── input shapes specific to this router ────────────────────────────────────

const listInput = z.object({
  projectId: z.string().optional()
});

const idInput = z.object({ id: z.string() });

const updateInput = patchImageDocumentInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string().optional()
  })
);

const versionsListInput = z.object({
  id: z.string(),
  layerId: z.string()
});

const versionsAppendInput = appendLayerVersionInput.and(
  z.object({ id: z.string(), layerId: z.string() })
);

const versionsSetFavoriteInput = z.object({
  id: z.string(),
  layerId: z.string(),
  versionId: z.string(),
  favorite: z.boolean()
});

const versionsDeleteInput = z.object({
  id: z.string(),
  layerId: z.string(),
  versionId: z.string()
});

const MAX_SUCCESSFUL_VERSIONS = 10;
const MAX_FAILED_VERSIONS = 5;

const okOutput = z.object({ ok: z.literal(true) });

// ── helpers ─────────────────────────────────────────────────────────────────

function toListItem(doc: ImageDocument) {
  return {
    id: doc.id,
    projectId: doc.project_id,
    name: doc.name,
    updatedAt: doc.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<ImageDocument> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const doc = await ImageDocument.findById(id);
  if (!doc || doc.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Image document not found");
  }
  return doc;
}

interface LayerWithVersions {
  id: string;
  versions?: LayerVersion[];
  [key: string]: unknown;
}

function findLayer(doc: ImageDocumentData, layerId: string): LayerWithVersions | undefined {
  return (doc.layers as LayerWithVersions[]).find((l) => l.id === layerId);
}

// ── router ──────────────────────────────────────────────────────────────────

export const sketchRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(imageDocumentListItem))
    .query(async ({ ctx, input }) => {
      const docs = input.projectId
        ? (await ImageDocument.listByProject(input.projectId)).filter(
            (d) => d.user_id === ctx.userId
          )
        : await ImageDocument.listByUser(ctx.userId);
      return docs.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(imageDocumentResponse)
    .query(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);
      return doc.toImageDocumentResponse();
    }),

  create: protectedProcedure
    .input(createImageDocumentInput)
    .output(imageDocumentResponse)
    .mutation(async ({ ctx, input }) => {
      const doc = new ImageDocument({
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        width: input.width,
        height: input.height,
        background_color: input.backgroundColor
      });
      await doc.save();
      return doc.toImageDocumentResponse();
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(imageDocumentResponse)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);

      if (
        input.baseUpdatedAt !== undefined &&
        input.baseUpdatedAt !== doc.updated_at
      ) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Image document has been modified since last load"
        );
      }

      const fields: Parameters<typeof ImageDocument.update>[1] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.width !== undefined) fields.width = input.width;
      if (input.height !== undefined) fields.height = input.height;
      if (input.backgroundColor !== undefined)
        fields.background_color = input.backgroundColor;
      if (input.thumbnailAssetId !== undefined)
        fields.thumbnail_asset_id = input.thumbnailAssetId;
      if (input.document !== undefined) fields.document = input.document;

      const updated = await ImageDocument.update(input.id, fields);
      if (!updated) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Image document not found");
      }
      return updated.toImageDocumentResponse();
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);
      await doc.delete();
      return { ok: true as const };
    }),

  versions: router({
    list: protectedProcedure
      .input(versionsListInput)
      .output(z.array(layerVersion))
      .query(async ({ ctx, input }) => {
        const imgDoc = await loadOwned(ctx.userId, input.id);
        const doc = imgDoc.toDocument();
        const layer = findLayer(doc, input.layerId);
        if (!layer) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer not found");
        }
        return layer.versions ?? [];
      }),

    append: protectedProcedure
      .input(versionsAppendInput)
      .output(layerVersion)
      .mutation(async ({ ctx, input }) => {
        const imgDoc = await loadOwned(ctx.userId, input.id);
        const doc = imgDoc.toDocument();
        const layer = findLayer(doc, input.layerId);
        if (!layer) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer not found");
        }

        const newVersion: LayerVersion = {
          id: createTimeOrderedUuid(),
          createdAt: new Date().toISOString(),
          jobId: input.jobId,
          assetId: input.assetId,
          dependencyHash: input.dependencyHash,
          workflowUpdatedAt: input.workflowUpdatedAt,
          paramOverridesSnapshot: input.paramOverridesSnapshot ?? {},
          costCredits: input.costCredits,
          durationMs: input.durationMs,
          status: input.status
        };

        if (!layer.versions) layer.versions = [];
        layer.versions.push(newVersion);

        // ── Pruning ─────────────────────────────────────────────────────────
        const successful = layer.versions.filter(
          (v) => v.status === "success"
        );
        const nonSuccessful = layer.versions.filter(
          (v) => v.status !== "success"
        );

        const favSuccessful = successful.filter((v) => v.favorite);
        const slotsForNonFav = Math.max(
          0,
          MAX_SUCCESSFUL_VERSIONS - favSuccessful.length
        );
        const nonFavSuccessful =
          slotsForNonFav > 0
            ? successful.filter((v) => !v.favorite).slice(-slotsForNonFav)
            : [];

        const prunedNonSuccessful = nonSuccessful.slice(-MAX_FAILED_VERSIONS);

        const all = [...favSuccessful, ...nonFavSuccessful, ...prunedNonSuccessful];
        all.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        layer.versions = all;

        await ImageDocument.update(input.id, {
          document: JSON.stringify(doc)
        });

        return newVersion;
      }),

    setFavorite: protectedProcedure
      .input(versionsSetFavoriteInput)
      .output(layerVersion)
      .mutation(async ({ ctx, input }) => {
        const imgDoc = await loadOwned(ctx.userId, input.id);
        const doc = imgDoc.toDocument();
        const layer = findLayer(doc, input.layerId);
        if (!layer) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer not found");
        }
        const versionIdx = (layer.versions ?? []).findIndex(
          (v) => v.id === input.versionId
        );
        if (versionIdx === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }
        const version = layer.versions![versionIdx];
        layer.versions![versionIdx] = { ...version, favorite: input.favorite };

        await ImageDocument.update(input.id, {
          document: JSON.stringify(doc)
        });

        return layer.versions![versionIdx];
      }),

    delete: protectedProcedure
      .input(versionsDeleteInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        const imgDoc = await loadOwned(ctx.userId, input.id);
        const doc = imgDoc.toDocument();
        const layer = findLayer(doc, input.layerId);
        if (!layer) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer not found");
        }
        const before = (layer.versions ?? []).length;
        layer.versions = (layer.versions ?? []).filter(
          (v) => v.id !== input.versionId
        );
        if (layer.versions.length === before) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }

        await ImageDocument.update(input.id, {
          document: JSON.stringify(doc)
        });

        return { ok: true as const };
      })
  })
});
