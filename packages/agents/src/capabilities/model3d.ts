/**
 * The `model3d` capability module — the headless twin of the browser's
 * `ui_3d_*` tools.
 *
 * Those tools drive a live three.js scene and fail when no editor is open,
 * which left an agent with no way to build or fix a 3D model on its own. These
 * six run the same verbs against the glTF asset itself: list the library, make
 * a scene, read what is in one, edit it in place, check it, and render it
 * through headless Blender. The scene
 * operations, the units (degrees, CSS hex) and the "uuid or name" addressing
 * are `@nodetool-ai/model3d`, shared with the editor, so a model built here
 * opens there unchanged.
 *
 * What has no headless equivalent is the camera: `ui_3d_frame_scene` and
 * `ui_3d_capture_view` need a WebGL context. `get_model3d` answers what it can
 * without one — the scene's world-space bounds.
 */

import type { GltfJson, Model3DFile } from "@nodetool-ai/model3d";
import {
  runBlenderJob,
  type BlenderEngine,
  type CameraMode,
  type LightingPreset
} from "@nodetool-ai/blender-nodes";
import { loadMediaRefBytes, type ProcessingContext } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  createModel3dSpec,
  editModel3dSpec,
  getModel3dSpec,
  listModel3dsSpec,
  renderModel3dSpec,
  validateModel3dSpec,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_OPS
} from "./model3d.specs.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isRecord, isString } from "../utils/type-guards.js";

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_OPS,
  LIST_MODEL3DS_SCHEMA,
  CREATE_MODEL3D_SCHEMA,
  GET_MODEL3D_SCHEMA,
  EDIT_MODEL3D_SCHEMA,
  VALIDATE_MODEL3D_SCHEMA,
  RENDER_MODEL3D_SCHEMA
} from "./model3d.specs.js";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString((value as ToolError).error);

/** Content types the 3D surface reads and writes. */
const GLTF_CONTENT_TYPES = new Set(["model/gltf-binary", "model/gltf+json"]);

const isGltfAsset = (asset: { content_type: string; name: string }): boolean =>
  GLTF_CONTENT_TYPES.has(asset.content_type) ||
  /\.(glb|gltf)$/i.test(asset.name);

/**
 * The asset id inside whatever the caller passed: a bare id, an
 * `asset://<id>.glb` URI, or an id with the file extension still on it.
 */
function assetIdOf(raw: unknown): string | ToolError {
  if (!isString(raw) || raw.trim() === "") {
    return {
      error: "model_id is required (use list_model3ds to find one)."
    };
  }
  const trimmed = raw.trim();
  const withoutScheme = trimmed.startsWith("asset://")
    ? trimmed.slice("asset://".length)
    : trimmed;
  const id = withoutScheme.replace(/\.(glb|gltf)$/i, "");
  return id || { error: `"${trimmed}" does not name a 3D model asset.` };
}

interface LoadedModelBytes {
  assetId: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

interface LoadedModel extends LoadedModelBytes {
  file: Model3DFile;
}

/**
 * Read a stored model's bytes. Missing, not-yours and unreadable all
 * report. `loadModel` parses on top; `render_model3d` hands the bytes to
 * Blender unparsed.
 */
async function loadModelBytes(
  run: CapabilityRun,
  rawId: unknown
): Promise<LoadedModelBytes | ToolError> {
  const assetId = assetIdOf(rawId);
  if (isError(assetId)) return assetId;

  const userId = userIdOf(run.context);
  if (!userId) return { error: "No user is bound to this session." };

  const { Asset } = await import("@nodetool-ai/models");
  const asset = await Asset.find(userId, assetId);
  // A model owned by someone else reads as missing — the rule every other
  // capability's ownership check applies.
  if (!asset) return { error: `3D model ${assetId} was not found.` };
  if (!isGltfAsset(asset)) {
    return {
      error: `Asset ${assetId} is ${asset.content_type}, not a .glb/.gltf model.`
    };
  }

  let bytes: Uint8Array | null = null;
  try {
    bytes = await loadMediaRefBytes(
      { uri: `asset://${assetId}`, asset_id: assetId },
      run.context
    );
  } catch (error) {
    return {
      error: `Could not read 3D model ${assetId}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (!bytes || bytes.length === 0) {
    return { error: `3D model ${assetId} has no stored bytes.` };
  }
  return { assetId, name: asset.name, contentType: asset.content_type, bytes };
}

/** Read a stored model and parse it. Missing, not-yours and unreadable all report. */
async function loadModel(
  run: CapabilityRun,
  rawId: unknown
): Promise<LoadedModel | ToolError> {
  const loaded = await loadModelBytes(run, rawId);
  if (isError(loaded)) return loaded;

  const { parseModel3D } = await import("@nodetool-ai/model3d");
  try {
    return { ...loaded, file: parseModel3D(loaded.bytes) };
  } catch (error) {
    return {
      error: `3D model ${loaded.assetId} could not be parsed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/** Write a document back over the asset it came from. */
async function saveModel(
  context: ProcessingContext,
  model: LoadedModel
): Promise<ToolError | null> {
  const { serializeModel3D, MIME_FOR_FORMAT } = await import(
    "@nodetool-ai/model3d"
  );
  const bytes = serializeModel3D(model.file);
  try {
    const saved = await context.updateAssetBytes({
      assetId: model.assetId,
      content: bytes,
      contentType: MIME_FOR_FORMAT[model.file.format]
    });
    return saved
      ? null
      : { error: `3D model ${model.assetId} was not found when saving.` };
  } catch (error) {
    return {
      error: `Could not save 3D model ${model.assetId}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/** One-line count of what a validation found. */
function validationSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// list_model3ds
// ---------------------------------------------------------------------------

const listModel3ds: CapabilityExport = {
  spec: listModel3dsSpec,
  impl: async (run, params) => {
    const userId = userIdOf(run.context);
    if (!userId) return { error: "No user is bound to this session." };

    const requested = Number(params["limit"] ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const query = isString(params["query"]) ? params["query"].trim() : "";

    const { Asset } = await import("@nodetool-ai/models");
    // Two passes, because an uploaded `.glb` often arrives typed
    // `application/octet-stream` — the reason `normalizeAssetContentType`
    // exists. Filtering on `model/` alone would hide exactly those, and the
    // filter is a prefix match, so each pass over-fetches and `isGltfAsset`
    // decides. Same rule the editor's own `isEditableModel3DAsset` applies.
    const page = limit * 4;
    const fetched = await Promise.all(
      ["model", "application/octet-stream"].map(async (contentType) => {
        const [assets] = query
          ? await Asset.searchAssetsGlobal(userId, query, {
              contentType,
              limit: page
            })
          : await Asset.paginate(userId, { contentType, limit: page });
        return assets;
      })
    );

    const byId = new Map<string, (typeof fetched)[number][number]>();
    for (const asset of fetched.flat()) {
      if (isGltfAsset(asset)) {
        byId.set(asset.id, asset);
      }
    }
    const models = [...byId.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((asset) => ({
        model_id: asset.id,
        name: asset.name,
        content_type: asset.content_type,
        size: asset.size,
        created_at: asset.created_at,
        updated_at: asset.updated_at
      }));
    return { models, count: models.length };
  }
};

// ---------------------------------------------------------------------------
// create_model3d
// ---------------------------------------------------------------------------

const createModel3d: CapabilityExport = {
  spec: createModel3dSpec,
  impl: async (run, params) => {
    const name = params["name"];
    if (!isString(name) || name.trim() === "") {
      return { error: "name is required and must be a non-empty string." };
    }

    const { createModel3DFile, MIME_FOR_FORMAT, serializeModel3D } =
      await import("@nodetool-ai/model3d");
    const file = createModel3DFile(name.trim().replace(/\.(glb|gltf)$/i, ""));

    if (params["ops"] !== undefined) {
      const applied = await applyOps(file, params["ops"]);
      if (isError(applied)) return applied;
    }

    const fileName = /\.(glb|gltf)$/i.test(name.trim())
      ? name.trim()
      : `${name.trim()}.gltf`;
    let created: unknown;
    try {
      created = await run.context.createAsset({
        name: fileName,
        contentType: MIME_FOR_FORMAT[file.format],
        content: serializeModel3D(file)
      });
    } catch (error) {
      return {
        error: `Could not create the 3D model asset: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    const assetId = isRecord(created) && isString(created["id"]) ? created["id"] : null;
    if (!assetId) {
      return { error: "The 3D model asset was created without an id." };
    }

    const { listScene, validateModel3D } = await import("@nodetool-ai/model3d");
    return {
      model_id: assetId,
      name: fileName,
      url: `asset://${assetId}.${file.format}`,
      objects: listScene(file.json),
      validation: validateModel3D(file.json)
    };
  }
};

// ---------------------------------------------------------------------------
// get_model3d
// ---------------------------------------------------------------------------

const getModel3d: CapabilityExport = {
  spec: getModel3dSpec,
  impl: async (run, params) => {
    const model = await loadModel(run, params["model_id"]);
    if (isError(model)) return model;

    const { listScene, sceneBounds, selectedId } = await import(
      "@nodetool-ai/model3d"
    );
    const objects = listScene(model.file.json);
    return {
      model_id: model.assetId,
      name: model.name,
      format: model.file.format,
      count: objects.length,
      objects,
      selected: selectedId(model.file.json),
      bounds: sceneBounds(model.file.json)
    };
  }
};

// ---------------------------------------------------------------------------
// edit_model3d
// ---------------------------------------------------------------------------

/** Parse and apply an operation list against a parsed document. */
async function applyOps(
  file: Model3DFile,
  raw: unknown
): Promise<{ results: unknown[] } | ToolError> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_object", "kind": "box"}].'
    };
  }
  if (raw.length > MAX_OPS) {
    return { error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.` };
  }

  const { applyOperation, parseOperation } = await import("@nodetool-ai/model3d");

  const results: unknown[] = [];
  for (const [index, entry] of raw.entries()) {
    const label = isRecord(entry) && isString(entry["op"]) ? entry["op"] : "?";
    try {
      // The operation layer owns both halves — which arguments an operation
      // needs, and what applying it does — so a missing `visible`, an unknown
      // primitive kind, a malformed color and a missing target all report by
      // name instead of writing something nobody asked for.
      results.push(applyOperation(file, parseOperation(entry)));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { error: `ops[${index}] (${label}) failed: ${reason}` };
    }
  }
  return { results };
}

const editModel3d: CapabilityExport = {
  spec: editModel3dSpec,
  impl: async (run, params) => {
    const model = await loadModel(run, params["model_id"]);
    if (isError(model)) return model;

    const applied = await applyOps(model.file, params["ops"]);
    if (isError(applied)) return applied;

    const saved = await saveModel(run.context, model);
    if (saved) return saved;

    const { listScene, validateModel3D } = await import("@nodetool-ai/model3d");
    const validation = validateModel3D(model.file.json);
    return {
      model_id: model.assetId,
      applied: applied.results,
      objects: listScene(model.file.json),
      validation: { ...validation, summary: validationSummary(validation) }
    };
  }
};

// ---------------------------------------------------------------------------
// validate_model3d
// ---------------------------------------------------------------------------

const validateModel3d: CapabilityExport = {
  spec: validateModel3dSpec,
  impl: async (run, params) => {
    const inline = params["document"];
    const hasInline = isRecord(inline);
    if (!hasInline && params["model_id"] === undefined) {
      return { error: "Pass either `model_id` or an inline `document`." };
    }

    let json: GltfJson;
    let modelId: string | undefined;
    if (hasInline) {
      json = inline as GltfJson;
    } else {
      const model = await loadModel(run, params["model_id"]);
      if (isError(model)) return model;
      json = model.file.json;
      modelId = model.assetId;
    }

    const { validateModel3D } = await import("@nodetool-ai/model3d");
    const validation = validateModel3D(json);
    const report: Record<string, unknown> = {
      ...validation,
      summary: validationSummary(validation)
    };
    if (modelId) {
      report.model_id = modelId;
    }
    return report;
  }
};

// ---------------------------------------------------------------------------
// render_model3d
// ---------------------------------------------------------------------------

/** A number param, or its default when missing or not finite. */
function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
}

const renderModel3d: CapabilityExport = {
  spec: renderModel3dSpec,
  impl: async (run, params) => {
    const model = await loadModelBytes(run, params["model_id"]);
    if (isError(model)) return model;

    const timeoutMs = Math.max(1, numParam(params, "timeout", 600)) * 1000;
    let png: Uint8Array;
    let stats: Record<string, unknown>;
    try {
      const result = await runBlenderJob(
        run.context,
        model.bytes,
        {
          op: "render_image",
          params: {
            camera_mode: String(params["camera_mode"] ?? "auto") as CameraMode,
            azimuth: numParam(params, "azimuth", 45),
            elevation: numParam(params, "elevation", 25),
            fov: numParam(params, "fov", 35),
            zoom: numParam(params, "zoom", 1),
            lighting: String(params["lighting"] ?? "studio") as LightingPreset,
            light_intensity: numParam(params, "light_intensity", 1),
            background_color: String(params["background_color"] ?? "#808080"),
            transparent: params["transparent"] === true,
            engine: String(params["engine"] ?? "eevee") as BlenderEngine,
            samples: Math.max(1, Math.round(numParam(params, "samples", 16))),
            denoise: params["denoise"] !== false,
            resolution_percentage: Math.max(
              1,
              Math.round(numParam(params, "resolution_percentage", 100))
            ),
            width: Math.max(1, Math.round(numParam(params, "width", 1024))),
            height: Math.max(1, Math.round(numParam(params, "height", 1024)))
          }
        },
        { image: "render.png" },
        { timeoutMs, signal: run.context.signal }
      );
      png = result.outputs["image"] ?? new Uint8Array();
      stats = result.stats as Record<string, unknown>;
    } catch (error) {
      return {
        error: `Could not render 3D model ${model.assetId}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    if (png.length === 0) {
      return { error: `Blender produced no image for 3D model ${model.assetId}.` };
    }

    let created: unknown;
    try {
      created = await run.context.createAsset({
        name: `${model.name.replace(/\.(glb|gltf)$/i, "") || "model"}.png`,
        contentType: "image/png",
        content: png
      });
    } catch (error) {
      return {
        error: `Could not store the render of 3D model ${model.assetId}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    const imageId = isRecord(created) && isString(created["id"]) ? created["id"] : null;
    if (!imageId) {
      return { error: "The render asset was created without an id." };
    }
    return { image_id: imageId, url: `asset://${imageId}.png`, stats };
  }
};

/** Every 3D-model capability, in declaration order. */
export const MODEL3D_CAPABILITIES: readonly CapabilityExport[] = [
  listModel3ds,
  createModel3d,
  getModel3d,
  editModel3d,
  validateModel3d,
  renderModel3d
];

export const module: CapabilityModule = {
  module: "model3d",
  exports: MODEL3D_CAPABILITIES
};

export { listModel3ds, createModel3d, getModel3d, editModel3d, validateModel3d, renderModel3d };
