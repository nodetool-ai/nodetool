/**
 * `nodetool.blender.ExportModel` — glTF scene → FBX, OBJ, or USD file.
 *
 * Stage 3: the `export_model` op over `LocalBlenderRunner` (D8). Takes a
 * `Model3DRef` and returns an `AssetRef`, never a `Model3DRef`: FBX, OBJ,
 * and USD are not glTF documents, and the `model_3d` socket keeps meaning
 * glTF everywhere. The node persists the export through
 * `context.createAsset` and returns `{ type: "asset", uri, asset_id,
 * metadata: { format, mime } }`. GLB is deliberately not a format here:
 * `PrepareForEngine` and `FormatConverter` already produce a `Model3DRef`
 * for it.
 *
 * Every failure rethrows with the node name prefixed. An abort through
 * `context.signal` passes through unwrapped so the node rejects with the
 * abort reason and no partial output.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ModelBytesRefLike } from "@nodetool-ai/nodes-utils";
import { isRecord, isString } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type { ExportFormat } from "../job.js";
import { BlenderJobError } from "../runner.js";
import { runBlenderJob } from "../run-job.js";
import { runBlenderNodeStep } from "./blender-error.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { blenderProgressHandler } from "./progress.js";

const NODE_NAME = "nodetool.blender.ExportModel";

/** Output handle ExportModelNode.process() emits. */
type ExportModelNodeOutputs = {
  file: {
    type: string;
    uri: string;
    asset_id: string;
    metadata: { format: string; mime: string };
  };
};

interface ExportTarget {
  /** Bare file name the op writes, whose extension selects the exporter. */
  file: string;
  mime: string;
}

const FORMAT_FILES = {
  fbx: { file: "model.fbx", mime: "application/octet-stream" },
  obj: { file: "model.obj", mime: "text/plain" },
  usd: { file: "model.usd", mime: "application/octet-stream" }
} satisfies Record<ExportFormat, ExportTarget>;

const EXPORT_FORMATS = ["fbx", "obj", "usd"] as const satisfies readonly ExportFormat[];

/** The format a user typed, or null when it names no exporter. */
function toExportFormat(value: string): ExportFormat | null {
  const normalized = value.toLowerCase();
  return EXPORT_FORMATS.find((format) => format === normalized) ?? null;
}

/** Blender ran past its wall clock: point at the knob that fixes it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender export timed out after ${timeoutMs}ms. ` +
    `Decimate the scene first, or raise the timeout.`
  );
}

export class ExportModelNode extends BaseNode {
  static readonly nodeType = "nodetool.blender.ExportModel";
  static readonly title = "Export 3D Model With Blender";
  static readonly description =
    "Export a 3D model (GLB/glTF) to FBX, OBJ, or USD with Blender, persisted as a stored asset.\n    3d, mesh, model, export, fbx, obj, usd, file, blender\n\n    Use cases:\n    - Hand a generated mesh to a game engine as FBX\n    - Export an OBJ for tools without glTF support\n    - Export USD for pipelines built on it";
  static readonly metadataOutputTypes = {
    file: "asset"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to export (GLB or glTF with embedded buffers)"
  })
  declare model: ModelBytesRefLike;

  @prop({
    type: "enum",
    default: "fbx",
    title: "Format",
    description: "Export format: fbx, obj, or usd (OBJ is geometry-only, no .mtl; GLB stays a Model3DRef — see Prepare For Engine)",
    values: ["fbx", "obj", "usd"]
  })
  declare format: ExportFormat;

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum export time in seconds", min: 1, max: 3600 })
  declare timeout: number;

  async process(context?: ProcessingContext): Promise<ExportModelNodeOutputs> {
    const bytes = await resolveModelBytes(this.model, context);
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }
    const requested = this.format ?? "fbx";
    const format = toExportFormat(requested);
    if (format === null) {
      throw new BlenderJobError(
        "bad_job",
        `${NODE_NAME}: unknown export format "${requested}" — choose fbx, obj, or usd.`
      );
    }
    const target = FORMAT_FILES[format];
    if (!context) {
      throw new BlenderJobError(
        "bad_job",
        `${NODE_NAME}: exporting needs a processing context with createAsset.`
      );
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    return runBlenderNodeStep(
      {
        nodeName: NODE_NAME,
        timeoutMessage: timeoutMessage(timeoutMs),
        signal: context.signal
      },
      async () => {
        const result = await runBlenderJob(
          context,
          bytes,
          { op: "export_model", params: { format } },
          { file: target.file },
          {
            timeoutMs,
            signal: context.signal,
            onProgress: blenderProgressHandler(context, this.__node_id)
          }
        );
        const raw = result.outputs["file"];
        if (!raw || raw.length === 0) {
          throw new BlenderJobError(
            "missing_output",
            "Blender produced no export bytes."
          );
        }
        const created = await context.createAsset({
          name: target.file,
          contentType: target.mime,
          content: raw
        });
        const assetId =
          isRecord(created) && isString(created["id"]) ? created["id"] : null;
        if (assetId === null) {
          throw new BlenderJobError(
            "bad_result",
            "The export asset was created without an id."
          );
        }
        return {
          file: {
            type: "asset",
            uri: `asset://${assetId}`,
            asset_id: assetId,
            metadata: { format, mime: target.mime }
          }
        };
      }
    );
  }
}

export const BLENDER_EXPORT_NODES = [ExportModelNode] as const;
