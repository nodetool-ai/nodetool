/**
 * Sketch (Image Editor) router — tRPC.
 *
 * Procedures:
 *   list        (query)    — ImageDocumentListItem[]
 *   get         (query)    — ImageDocumentResponse
 *   create      (mutation) — ImageDocumentResponse
 *   update      (mutation) — ImageDocumentResponse
 *   delete      (mutation) — { ok: true }
 *   versions:                — per-layer generation takes
 *     list        (query)    — LayerVersion[]
 *     append      (mutation) — LayerVersion
 *     setFavorite (mutation) — LayerVersion
 *     delete      (mutation) — { ok: true }
 *   documentVersions:        — whole-document snapshot history
 *     list        (query)    — SketchVersionListItem[]
 *     get         (query)    — SketchVersionResponse
 *     create      (mutation) — SketchVersionListItem (manual snapshot)
 *     restore     (mutation) — ImageDocumentResponse (snapshots the
 *                              pre-restore state first, so it is undoable)
 *     delete      (mutation) — { ok: true }
 *   layers:
 *     create      (mutation) — LayerWorkflowBinding
 *     duplicate   (mutation) — LayerWorkflowBinding
 */

import { z } from "zod";
import {
  ImageDocument,
  ImageDocumentConflictError,
  ImageDocumentVersion,
  Workflow,
  createTimeOrderedUuid
} from "@nodetool-ai/models";
import type {
  ImageDocumentData,
  ImageDocumentSaveType
} from "@nodetool-ai/models";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { computeDependencyHash } from "@nodetool-ai/image-editor/dependencyHash.js";
import {
  appendLayerVersionInput,
  createImageDocumentInput,
  createLayerInput,
  createLayerResponse,
  createSketchVersionInput,
  deleteSketchVersionInput,
  getSketchVersionInput,
  imageDocumentListItem,
  imageDocumentResponse,
  layerVersion,
  listSketchVersionsInput,
  patchImageDocumentInput,
  restoreSketchVersionInput,
  sketchVersionListItem,
  sketchVersionResponse
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { isString } from "../../lib/wire-values.js";

/** A decoded JSON value: what a stored document or graph carries. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
const DEFAULT_SKETCH_ACTIVE_TOOL = "brush";

function toListItem(doc: ImageDocument) {
  return {
    id: doc.id,
    projectId: doc.project_id,
    name: doc.name,
    updatedAt: doc.updated_at
  };
}

/**
 * A version row carries its document as JSON text on SQLite and as an object on
 * Postgres, so parse only when it is a string. A row that is neither is
 * corrupt, and reporting that beats handing the client a string it will treat
 * as a document.
 */
function parseVersionDocument(raw: unknown): JsonValue {
  // SAFETY: a Postgres json column arrives already decoded, and the row's
  // document is JSON either way.
  if (!isString(raw)) return raw as JsonValue;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    throwApiError(
      ApiErrorCode.INTERNAL_ERROR,
      "Stored version document is not valid JSON"
    );
  }
}

function toDocumentVersionListItem(
  version: InstanceType<typeof ImageDocumentVersion>
) {
  return {
    id: version.id,
    version: version.version,
    name: version.name ?? null,
    saveType: version.save_type as ImageDocumentSaveType,
    width: version.width,
    height: version.height,
    backgroundColor: version.background_color,
    createdAt: version.created_at
  };
}

// ── autosave snapshot cadence ───────────────────────────────────────────────

/** A document write only snapshots when the last autosave is this old. */
const AUTOSAVE_VERSION_INTERVAL_MS = 5 * 60 * 1000;
/** Autosave snapshots kept per sketch; older ones are pruned. */
const MAX_AUTOSAVE_VERSIONS = 20;

const lastAutosaveVersionTime = new Map<string, number>();

// Entries older than the interval can never suppress a snapshot again, so drop
// them. Without this the map grows one permanent entry per sketch ever saved
// (including deleted ones) for the lifetime of the process.
function recordAutosaveVersion(id: string, now: number): void {
  for (const [key, ts] of lastAutosaveVersionTime) {
    if (now - ts >= AUTOSAVE_VERSION_INTERVAL_MS) {
      lastAutosaveVersionTime.delete(key);
    }
  }
  lastAutosaveVersionTime.set(id, now);
}

/** Test hook: forget the autosave cadence so a suite can drive it from zero. */
export function __resetSketchAutosaveVersionState(): void {
  lastAutosaveVersionTime.clear();
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

async function mutateOwnedDocumentData<T>(
  ctxUserId: string | null,
  id: string,
  mutator: (data: ImageDocumentData) => T | Promise<T>
): Promise<T> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");

  try {
    const mutation = await ImageDocument.mutateDocumentData(
      id,
      async (data, doc) => {
        if (doc.user_id !== ctxUserId) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Image document not found");
        }
        return mutator(data);
      }
    );
    if (!mutation) {
      throwApiError(ApiErrorCode.NOT_FOUND, "Image document not found");
    }
    return mutation.result;
  } catch (error) {
    if (error instanceof ImageDocumentConflictError) {
      throwApiError(
        ApiErrorCode.ALREADY_EXISTS,
        "Document was modified concurrently; retry the operation"
      );
    }
    throw error;
  }
}

const IMAGE_OUTPUT_TYPES = {
  "nodetool.output.ImageOutput": true,
  "nodetool.output.MaskOutput": true,
  "nodetool.output.Output": true
} satisfies Record<string, true>;

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

function inputNodeDefault(node: Record<string, unknown>): JsonValue {
  // SAFETY: the graph is stored as JSON, so a node's `data` holds JSON members.
  const data = node.data as { [key: string]: JsonValue } | undefined;
  return data?.value ?? null;
}

export const sketchRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(imageDocumentListItem))
    .query(async ({ ctx, input }) => {
      const docs = input.projectId
        ? await ImageDocument.listByProject(input.projectId, ctx.userId)
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
      const initialLayerId = createTimeOrderedUuid();
      const defaultSketch: ImageDocumentData["sketch"] = {
        version: 3,
        canvas: {
          width: input.width,
          height: input.height,
          backgroundColor: input.backgroundColor
        },
        layers: [
          {
            id: initialLayerId,
            name: "Layer 1",
            type: "raster",
            visible: true,
            opacity: 1,
            locked: false,
            alphaLock: false,
            blendMode: "normal",
            data: null,
            transform: { x: 0, y: 0 },
            contentBounds: {
              x: 0,
              y: 0,
              width: input.width,
              height: input.height
            },
            effects: []
          }
        ],
        activeLayerId: initialLayerId,
        maskLayerId: null,
        activeTool: DEFAULT_SKETCH_ACTIVE_TOOL,
        viewport: {
          zoom: 1,
          pan: { x: 0, y: 0 }
        },
        history: [],
        historyIndex: -1,
        metadata: { createdAt: now, updatedAt: now }
      };
      const docData: ImageDocumentData = {
        sketch: defaultSketch,
        layerBindings: []
      };

      // A client-minted id makes create idempotent: a retry (or a second
      // surface racing to create the same document) returns the existing row
      // instead of duplicating it.
      if (input.id) {
        const existing = await ImageDocument.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Image document not found");
          }
          return existing.toResponse();
        }
      }

      const fields: ConstructorParameters<typeof ImageDocument>[0] = {
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        width: input.width,
        height: input.height,
        background_color: input.backgroundColor,
        document: JSON.stringify(docData),
        created_at: now,
        updated_at: now
      };
      // Set only when the client supplied one — the model defaults an id it
      // does not already own as a property.
      if (input.id) {
        fields.id = input.id;
      }
      const doc = new ImageDocument(fields);
      await doc.save();
      return doc.toResponse();
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(imageDocumentResponse)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);

      // CAS on this value so the conflict check and the write are atomic. When
      // the client supplies baseUpdatedAt, honor it; otherwise fall back to the
      // just-loaded updated_at so a concurrent write still can't be clobbered.
      const expectedUpdatedAt = input.baseUpdatedAt ?? doc.updated_at;
      if (input.baseUpdatedAt && doc.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Document was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<
        typeof ImageDocument.updateFieldsIfUnchanged
      >[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.width !== undefined) fields.width = input.width;
      if (input.height !== undefined) fields.height = input.height;
      if (input.backgroundColor !== undefined)
        fields.background_color = input.backgroundColor;
      if (input.thumbnailAssetId !== undefined)
        fields.thumbnail_asset_id = input.thumbnailAssetId;
      if (input.document !== undefined)
        fields.document = JSON.stringify(input.document);

      const updated = await ImageDocument.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        // Row changed between load and write (or was deleted): report a
        // conflict rather than overwriting the concurrent change.
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Document was modified since last read (optimistic concurrency conflict)"
        );
      }

      if (input.document !== undefined) {
        // Best-effort history: a snapshot that fails must never fail the save
        // the user actually asked for (and the versions table may not exist on
        // an older database).
        try {
          const now = Date.now();
          const last = lastAutosaveVersionTime.get(input.id);
          if (
            last === undefined ||
            now - last >= AUTOSAVE_VERSION_INTERVAL_MS
          ) {
            recordAutosaveVersion(input.id, now);
            await ImageDocumentVersion.snapshot(updated, {
              saveType: "autosave"
            });
            await ImageDocumentVersion.pruneAutosaves(
              input.id,
              MAX_AUTOSAVE_VERSIONS
            );
          }
        } catch {
          // non-fatal — the document write already succeeded
        }
      }

      return updated.toResponse();
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const doc = await loadOwned(ctx.userId, input.id);
      await doc.delete();
      // Belt-and-braces with the FK cascade: version rows outliving their
      // document would be unreachable garbage.
      await ImageDocumentVersion.deleteForDocument(input.id);
      lastAutosaveVersionTime.delete(input.id);
      return { ok: true as const };
    }),

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

        return mutateOwnedDocumentData(ctx.userId, input.id, (data) => {
          const binding = findBinding(data, input.layerId);
          if (!binding) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
          }

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

          return newVersion;
        });
      }),

    setFavorite: protectedProcedure
      .input(versionsSetFavoriteInput)
      .output(layerVersion)
      .mutation(async ({ ctx, input }) => {
        return mutateOwnedDocumentData(ctx.userId, input.id, (data) => {
          const binding = findBinding(data, input.layerId);
          if (!binding) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
          }

          const version = binding.versions.find(
            (v) => v.id === input.versionId
          );
          if (!version) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
          }

          version.favorite = input.favorite;
          return version;
        });
      }),

    delete: protectedProcedure
      .input(versionsDeleteInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        return mutateOwnedDocumentData(ctx.userId, input.id, (data) => {
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

          return { ok: true as const };
        });
      })
  }),

  documentVersions: router({
    list: protectedProcedure
      .input(listSketchVersionsInput)
      .output(z.array(sketchVersionListItem))
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const versions = await ImageDocumentVersion.listForDocument(input.id, {
          limit: input.limit,
          saveType: input.saveType
        });
        return versions.map(toDocumentVersionListItem);
      }),

    get: protectedProcedure
      .input(getSketchVersionInput)
      .output(sketchVersionResponse)
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await ImageDocumentVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Sketch version not found");
        }
        return {
          ...toDocumentVersionListItem(version),
          document: parseVersionDocument(version.document)
        };
      }),

    create: protectedProcedure
      .input(createSketchVersionInput)
      .output(sketchVersionListItem)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const version = await ImageDocumentVersion.snapshot(doc, {
          saveType: "manual",
          name: input.name ?? null
        });
        return toDocumentVersionListItem(version);
      }),

    restore: protectedProcedure
      .input(restoreSketchVersionInput)
      .output(imageDocumentResponse)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);
        const version = await ImageDocumentVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Sketch version not found");
        }

        // Snapshot what is about to be overwritten first, so a restore is
        // itself undoable.
        await ImageDocumentVersion.snapshot(doc, {
          saveType: "restore",
          name: `Before restore to v${input.version}`
        });

        const document = parseVersionDocument(version.document);
        const updated = await ImageDocument.updateFieldsIfUnchanged(
          input.id,
          doc.updated_at,
          {
            document: JSON.stringify(document),
            width: version.width,
            height: version.height,
            background_color: version.background_color
          }
        );
        if (!updated) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            "Document was modified since last read (optimistic concurrency conflict)"
          );
        }
        return updated.toResponse();
      }),

    delete: protectedProcedure
      .input(deleteSketchVersionInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await ImageDocumentVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Sketch version not found");
        }
        await version.delete();
        return { ok: true as const };
      })
  }),

  layers: router({
    create: protectedProcedure
      .input(createLayerInput)
      .output(createLayerResponse)
      .mutation(async ({ ctx, input }) => {
        const doc = await loadOwned(ctx.userId, input.id);

        const data = doc.toDocumentData();
        if (findBinding(data, input.layerId)) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            `Layer binding already exists for layerId ${input.layerId}`
          );
        }

        // Validate access to the source workflow: caller must own it or it
        // must be public. Workflow.find filters out private workflows owned
        // by other users.
        const source = await Workflow.find(ctx.userId!, input.sourceWorkflowId);
        if (!source) {
          throwApiError(
            ApiErrorCode.NOT_FOUND,
            "Source workflow not found or not accessible"
          );
        }

        const sourceNodes = (source.graph?.nodes ?? []) as Record<
          string,
          unknown
        >[];

        const outputNodes = sourceNodes.filter((n) =>
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
              `selectedOutputNodeId ${input.selectedOutputNodeId} is not an image output node in the source graph`
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

        const paramOverrides: Record<string, unknown> = {};
        for (const node of sourceNodes) {
          if (!isInputNode(node.type as string)) continue;
          const name = inputNodeName(node);
          if (name) {
            paramOverrides[name] = inputNodeDefault(node);
          }
        }

        const workflowUpdatedAt =
          (source.updated_at as string | undefined | null) ??
          new Date().toISOString();
        const dependencyHash = computeDependencyHash({
          workflowId: source.id,
          workflowUpdatedAt,
          paramOverrides,
          inputAssetHashes: [],
          selectedOutputNodeId: selectedOutputNode.id as string
        });

        const newBinding: LayerWorkflowBinding = {
          layerId: input.layerId,
          workflowId: source.id,
          selectedOutputNodeId: selectedOutputNode.id as string,
          paramOverrides,
          dependencyHash,
          lastGeneratedHash: undefined,
          currentAssetId: undefined,
          status: "draft",
          versions: []
        };

        return await mutateOwnedDocumentData(ctx.userId, input.id, (latest) => {
          if (findBinding(latest, input.layerId)) {
            throwApiError(
              ApiErrorCode.ALREADY_EXISTS,
              `Layer binding already exists for layerId ${input.layerId}`
            );
          }
          latest.layerBindings.push(newBinding);
          return newBinding;
        });
      }),

    duplicate: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          layerId: z.string(),
          newLayerId: z.string()
        })
      )
      .output(createLayerResponse)
      .mutation(async ({ ctx, input }) => {
        return await mutateOwnedDocumentData(ctx.userId, input.id, (latest) => {
          const src = findBinding(latest, input.layerId);
          if (!src) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Layer binding not found");
          }
          if (findBinding(latest, input.newLayerId)) {
            throwApiError(
              ApiErrorCode.ALREADY_EXISTS,
              `Layer binding already exists for layerId ${input.newLayerId}`
            );
          }

          const newBinding: LayerWorkflowBinding = {
            layerId: input.newLayerId,
            workflowId: src.workflowId,
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

          latest.layerBindings.push(newBinding);
          return newBinding;
        });
      })
  })
});
