/**
 * `nodetool.blender.PrepareForEngine` — glTF mesh → game-engine GLB + LODs.
 *
 * Stage 3: the `prepare_for_engine` op over `LocalBlenderRunner` (D8). Takes
 * a `Model3DRef`, decimates every mesh toward `target_faces`, optionally
 * unwraps and bakes (`ao`, `normal`, or both) into the materials, then
 * returns the prepared model as an inline `model_3d` ref (GLB, like every
 * other `model_3d` socket) plus `lod_count` LODs at halving face targets.
 * Downstream save nodes decide persistence.
 *
 * Every failure rethrows with the node name prefixed. An abort through
 * `context.signal` passes through unwrapped so the node rejects with the
 * abort reason and no partial output.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { bytesToBase64, resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type { BakeMode } from "../job.js";
import { BlenderJobError } from "../runner.js";
import { runBlenderJob } from "../run-job.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { blenderProgressHandler } from "./progress.js";

const NODE_NAME = "nodetool.blender.PrepareForEngine";

/** An inline `model_3d` ref carrying GLB bytes, like `RenderToImage`'s image. */
interface InlineModel3DRef {
  type: string;
  uri: string;
  asset_id: null;
  data: string;
}

/** Output handles PrepareForEngineNode.process() emits. */
type PrepareForEngineNodeOutputs = {
  model: InlineModel3DRef;
  lods: InlineModel3DRef[];
};

function modelRef(bytes: Uint8Array): InlineModel3DRef {
  return { type: "model_3d", uri: "", asset_id: null, data: bytesToBase64(bytes) };
}

/** Blender ran past its wall clock: point at the knob that fixes it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender mesh preparation timed out after ${timeoutMs}ms. ` +
    `Lower the bake resolution, decimate first, or raise the timeout.`
  );
}

export class PrepareForEngineNode extends BaseNode {
  static readonly nodeType = "nodetool.blender.PrepareForEngine";
  static readonly title = "Prepare 3D Model For Engine";
  static readonly description =
    "Prepare a 3D model (GLB/glTF) for a game engine with Blender: decimate to a face budget, unwrap UVs, bake AO and normal maps, and emit LODs at halving face counts.\n    3d, mesh, decimate, unwrap, bake, lod, glb, game, engine, blender\n\n    Use cases:\n    - Shrink a generated mesh to a face budget for a game engine\n    - Bake AO and normal maps into the materials\n    - Emit LODs alongside the prepared model";
  static readonly metadataOutputTypes = {
    model: "model_3d",
    lods: "list[model_3d]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to prepare (GLB or glTF with embedded buffers)"
  })
  declare model: any;

  @prop({ type: "int", default: 5000, title: "Target Faces", description: "Face budget every mesh is decimated toward; meshes already under it are left alone", min: 1, max: 1000000 })
  declare target_faces: any;

  @prop({ type: "bool", default: true, title: "Unwrap", description: "UV-unwrap every mesh (smart project) before baking; baking projects missing UVs anyway" })
  declare unwrap: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Bake",
    description: "Maps to bake into the materials at Bake Resolution: none, ao (occlusion multiplied into base color), normal (tangent-space normal map), or both",
    values: ["none", "ao", "normal", "both"]
  })
  declare bake: any;

  @prop({ type: "int", default: 1024, title: "Bake Resolution", description: "Width and height in pixels of each baked map", min: 16, max: 4096 })
  declare bake_resolution: any;

  @prop({ type: "int", default: 0, title: "LOD Count", description: "How many LODs to emit alongside the model, at halving face targets (LOD 1 is half the prepared faces, LOD 2 a quarter, and so on)", min: 0, max: 8 })
  declare lod_count: any;

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum preparation time in seconds", min: 1, max: 3600 })
  declare timeout: any;

  async process(context?: ProcessingContext): Promise<PrepareForEngineNodeOutputs> {
    const bytes = await resolveModelBytes(
      (this.model ?? {}) as { data?: Uint8Array | string; uri?: string },
      context
    );
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }
    const lodCount = Math.min(
      8,
      Math.max(0, Math.round(Number(this.lod_count ?? 0)))
    );
    const outputs: Record<string, string> = { model: "model.glb" };
    for (let index = 1; index <= lodCount; index++) {
      outputs[`lod_${index}`] = `lod_${index}.glb`;
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    try {
      const result = await runBlenderJob(
        context,
        bytes,
        {
          op: "prepare_for_engine",
          params: {
            target_faces: Math.min(
              1000000,
              Math.max(1, Math.round(Number(this.target_faces ?? 5000)))
            ),
            unwrap: this.unwrap !== false,
            bake: String(this.bake ?? "none") as BakeMode,
            bake_resolution: Math.min(
              4096,
              Math.max(16, Math.round(Number(this.bake_resolution ?? 1024)))
            ),
            lod_count: lodCount
          }
        },
        outputs,
        {
          timeoutMs,
          signal: context?.signal,
          onProgress: blenderProgressHandler(context, this.__node_id)
        }
      );
      const model = result.outputs["model"];
      if (!model || model.length === 0) {
        throw new BlenderJobError(
          "missing_output",
          "Blender produced no model bytes."
        );
      }
      const lods: InlineModel3DRef[] = [];
      for (let index = 1; index <= lodCount; index++) {
        const raw = result.outputs[`lod_${index}`];
        if (!raw || raw.length === 0) {
          throw new BlenderJobError(
            "missing_output",
            `Blender produced no bytes for LOD ${index}.`
          );
        }
        lods.push(modelRef(raw));
      }
      return { model: modelRef(model), lods };
    } catch (err) {
      // Cancellation rejects with the abort reason: pass it through
      // unwrapped so the node rejects with the abort reason.
      if (context?.signal?.aborted) throw err;
      if (err instanceof BlenderJobError && err.code === "timeout") {
        throw new BlenderJobError("timeout", timeoutMessage(timeoutMs));
      }
      if (err instanceof BlenderJobError) {
        throw new BlenderJobError(err.code, `${NODE_NAME}: ${err.message}`);
      }
      if (err instanceof Error) {
        throw new Error(`${NODE_NAME}: ${err.message}`);
      }
      throw new Error(`${NODE_NAME}: ${String(err)}`);
    }
  }
}

export const BLENDER_PREPARE_NODES = [PrepareForEngineNode] as const;
