/**
 * Sketch (Image Editor) router — tRPC.
 *
 * Procedures:
 *   list        (query)    — ImageDocumentListItem[]
 *   get         (query)    — ImageDocumentResponse
 *   create      (mutation) — ImageDocumentResponse
 *   update      (mutation) — ImageDocumentResponse
 *   delete      (mutation) — { ok: true }
 *   versions:
 *     list        (query)    — LayerVersion[]
 *     append      (mutation) — LayerVersion
 *     setFavorite (mutation) — LayerVersion
 *     delete      (mutation) — { ok: true }
 *   layers:
 *     create      (mutation) — LayerWorkflowBinding
 *     delete      (mutation) — { ok: true }
 *     duplicate   (mutation) — LayerWorkflowBinding
 *
 * Mirrors the Timeline router, retargeted from clips→layers.
 */

import { z } from "zod";
import {
  ImageDocument,
  Workflow,
  createTimeOrderedUuid
} from "@nodetool-ai/models";
import type { ImageDocumentData } from "@nodetool-ai/models";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { computeDependencyHash } from "@nodetool-ai/image-editor/dependencyHash.js";
import {
  appendLayerVersionInput,
  createImageDocumentInput,
  createLayerInput,
  createLayerResponse,
  imageDocumentListItem,
  imageDocumentResponse,
  layerVersion,
  patchImageDocumentInput
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
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

function findBinding(
  data: ImageDocumentData,
  layerId: string
): LayerWorkflowBinding | undefined {
  return data.layerBindings.find((b) => b.layerId === layerId);
}

// ── Node-type helpers ────────────────────────────────────────────────────────

const IMAGE_OUTPUT_TYPES: Record<string, true> = {
  "nodetool.output.ImageOutput": true,
  "nodetool.output.MaskOutput": true,
  "nodetool.output.Output": true
};

function isImageOutputNode(nodeType: string): boolean {
  return nodeType in IMAGE_OUTPUT_TYPES;
}

function isInputNode(nodeType: string): boolean {
  return nodeType.startsWith("nodetool.input.");
}

function inputNodeName(node: Record<string, unknown>): string | null {
  const data = node.data as Record<string, unknown> | undefined;
  return (
    (data?.name as string | undefined) ??
    ((node.dynamic_properties as Record<string, unknown> | undefined)?.name as
      | string
      | undefined) ??
    null
  );
}

function inputNodeDefault(node: Record<string, unknown>): unknown {
  const data = node.data as Record<string, unknown> | undefined;
  return data?.value ?? null;
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
      return doc.toResponse();
    }),

  create: protectedProcedure
    .input(createImageDocumentInput)
    .output(imageDocumentResponse)
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const defaultSketch = {
        version: 1,
        canvas: { width: input.width, height: input.height },
        layers: [],
        activeLayerId: "",
        metadata: { createdAt: now, updatedAt: now }
      };
      const docData: ImageDocumentData = {
        sketch: defaultSketch,
        layerBindings: []
      };

      const doc = new ImageDocument({
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        width: input.width,
        height: input.height,
        background_color: input.backgroundColor,
        document: JSON.stringify(docData),
        created_at: now,
        updated_at: now
      });
      await doc.save();
      return doc.toResponse();
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(imageDocumentResponse)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);

      if (input.baseUpdatedAt && doc.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Document was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Record<string, unknown> = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.width !== undefined) fields.width = input.width;
      if (input.height !== undefined) fields.height = input.height;
      if (input.backgroundColor !== undefined)
        fields.background_color = input.backgroundColor;
      if (input.thumbnailAssetId !== undefined)
        fields.thumbnail_asset_id = input.thumbnailAssetId;
      if (input.document !== undefined)
        fields.document = JSON.stringify(input.document);

      const updated = await ImageDocument.updateDoc(input.id, fields);
      if (!updated) throwApiError(ApiErrorCode.NOT_FOUND, "Document not found");
      return updated.toResponse();
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);
      const data = doc.toDocumentData();
      const workflowIds = data.layerBindings
        .map((b) => b.workflowId)
        .filter(Boolean) as string[];

      // Delete the document first so countLayerReferences no longer
      // finds it, then cascade-delete orphaned layer workflows.
      await doc.delete();

      for (const wfId of workflowIds) {
        await Workflow.deleteLayerIfOrphaned(wfId);
      }
      return { ok: true as const };
    }),

  // ── versions sub-router ──────────────────────────────────────────────────

  versions: router({
    list: protectedProcedure
      .input(versionsListInput)
      .output(z.array(layerVersion))
      .query(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const binding = findBinding(data, input.layerId);
        if (!binding) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }
        return binding.versions;
      }),

    append: protectedProcedure
      .input(versionsAppendInput)
      .output(layerVersion)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const binding = findBinding(data, input.layerId);
        if (!binding) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }

        const newVersion = {
          id: createTimeOrderedUuid(),
          createdAt: new Date().toISOString(),
          jobId: input.jobId,
          assetId: input.assetId,
          workflowUpdatedAt: input.workflowUpdatedAt,
          dependencyHash: input.dependencyHash,
          paramOverridesSnapshot: input.paramOverridesSnapshot ?? {},
          costCredits: input.costCredits,
          durationMs: input.durationMs,
          status: input.status as "success" | "failed" | "cancelled"
        };

        binding.versions.push(newVersion);

        // Prune: keep all favorites, newest N successful, newest M failed
        const favorites = binding.versions.filter((v) => v.favorite);
        const nonFavorite = binding.versions.filter((v) => !v.favorite);
        const successful = nonFavorite
          .filter((v) => v.status === "success")
          .slice(-MAX_SUCCESSFUL_VERSIONS);
        const failed = nonFavorite
          .filter((v) => v.status !== "success")
          .slice(-MAX_FAILED_VERSIONS);
        binding.versions = [...favorites, ...successful, ...failed].sort(
          (a, b) => a.createdAt.localeCompare(b.createdAt)
        );

        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        return newVersion;
      }),

    setFavorite: protectedProcedure
      .input(versionsSetFavoriteInput)
      .output(layerVersion)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const binding = findBinding(data, input.layerId);
        if (!binding) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }

        const version = binding.versions.find((v) => v.id === input.versionId);
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }

        version.favorite = input.favorite;

        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        return version;
      }),

    delete: protectedProcedure
      .input(versionsDeleteInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const binding = findBinding(data, input.layerId);
        if (!binding) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }

        const before = binding.versions.length;
        binding.versions = binding.versions.filter(
          (v) => v.id !== input.versionId
        );
        if (binding.versions.length === before) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }

        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        return { ok: true as const };
      })
  }),

  // ── layers sub-router ────────────────────────────────────────────────────

  layers: router({
    create: protectedProcedure
      .input(createLayerInput)
      .output(createLayerResponse)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);

        // Clone the source workflow into a layer-private row
        const clone = await Workflow.cloneAsLayerPrivate(
          input.sourceWorkflowId,
          ctx.userId!
        );

        const nodes = (clone.graph?.nodes ?? []) as Record<string, unknown>[];

        // Find terminal output nodes suitable for image layers
        const outputNodes = nodes.filter((n) =>
          isImageOutputNode(n.type as string)
        );

        if (outputNodes.length === 0) {
          throwApiError(
            ApiErrorCode.SKETCH_NO_IMAGE_OUTPUT,
            "Source workflow has no image output node (ImageOutput, MaskOutput, or Output)"
          );
        }

        let selectedOutputNode: Record<string, unknown>;
        if (input.selectedOutputNodeId) {
          const found = outputNodes.find(
            (n) => n.id === input.selectedOutputNodeId
          );
          if (!found) {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              `selectedOutputNodeId ${input.selectedOutputNodeId} is not an image output node in the cloned graph`
            );
          }
          selectedOutputNode = found;
        } else if (outputNodes.length === 1) {
          selectedOutputNode = outputNodes[0]!;
        } else {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "Source workflow has multiple output nodes; provide selectedOutputNodeId"
          );
        }

        // Seed paramOverrides from each Input* node default
        const paramOverrides: Record<string, unknown> = {};
        for (const node of nodes) {
          if (!isInputNode(node.type as string)) continue;
          const name = inputNodeName(node);
          if (name) {
            paramOverrides[name] = inputNodeDefault(node);
          }
        }

        // Compute initial dependencyHash
        const workflowUpdatedAt =
          (clone.updated_at as string | undefined | null) ??
          new Date().toISOString();
        const dependencyHash = computeDependencyHash({
          workflowId: clone.id,
          workflowUpdatedAt,
          paramOverrides,
          inputAssetHashes: []
        });

        const newBinding: LayerWorkflowBinding = {
          layerId: input.layerId,
          workflowId: clone.id,
          selectedOutputNodeId: selectedOutputNode.id as string,
          paramOverrides,
          dependencyHash,
          lastGeneratedHash: undefined,
          currentAssetId: undefined,
          status: "draft",
          versions: []
        };

        const data = doc.toDocumentData();
        data.layerBindings.push(newBinding);

        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        return newBinding;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string(), layerId: z.string() }))
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const bindingIndex = data.layerBindings.findIndex(
          (b) => b.layerId === input.layerId
        );
        if (bindingIndex === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }

        const binding = data.layerBindings[bindingIndex];
        data.layerBindings.splice(bindingIndex, 1);
        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        if (binding?.workflowId) {
          await Workflow.deleteLayerIfOrphaned(binding.workflowId);
        }
        return { ok: true as const };
      }),

    duplicate: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          layerId: z.string(),
          newLayerId: z.string(),
          mode: z.enum(["linked", "variation"])
        })
      )
      .output(createLayerResponse)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const data = doc.toDocumentData();
        const src = findBinding(data, input.layerId);
        if (!src) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
        }

        let newWorkflowId = src.workflowId;
        if (input.mode === "variation" && src.workflowId) {
          const clonedWorkflow = await Workflow.cloneAsLayerPrivate(
            src.workflowId,
            ctx.userId
          );
          newWorkflowId = clonedWorkflow.id;
        }

        const newBinding: LayerWorkflowBinding = {
          layerId: input.newLayerId,
          workflowId: newWorkflowId,
          selectedOutputNodeId: src.selectedOutputNodeId,
          paramOverrides: src.paramOverrides
            ? structuredClone(src.paramOverrides)
            : undefined,
          dependencyHash: src.dependencyHash,
          lastGeneratedHash: undefined,
          currentAssetId: undefined,
          status: "draft",
          versions: []
        };

        data.layerBindings.push(newBinding);
        await ImageDocument.updateDoc(input.id, {
          document: JSON.stringify(data)
        });

        return newBinding;
      })
  })
});
