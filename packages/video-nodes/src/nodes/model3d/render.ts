/**
 * `nodetool.model3d.RenderToImage` — 3D scene + camera → image.
 *
 * Hybrid node (issue #3532): in the browser runner it renders directly with
 * three.js on an `OffscreenCanvas` (no headless Chrome involved); on the Node
 * backend it drives a headless Chromium running the same render core
 * (`render3d-headless.ts`). Both paths share `render3d-core.ts`, so a
 * workflow produces the same pixels wherever it executes.
 *
 * The model bytes are resolved locally (not via `./utils.js`) because this
 * module must bundle for the browser and `utils.ts` imports `node:path` at
 * module scope.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { NODE_AND_BROWSER_PLATFORMS } from "@nodetool-ai/protocol";
import { IS_NODE } from "@nodetool-ai/config";
import { base64ToBytes, bytesToBase64 } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { DEFAULT_MODEL_3D } from "./defaults.js";
import type { LightingPreset, Render3DOptions } from "./render3d-core.js";
import type { Model3DRefLike } from "./types.js";

const RENDERABLE_FORMATS = new Set(["", "glb", "gltf"]);

/** Browser-safe model-bytes resolution (inline data → storage → uri fetch). */
async function resolveModelBytes(
  model: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!model || typeof model !== "object") return new Uint8Array();
  const ref = model as Model3DRefLike;

  if (ref.data instanceof Uint8Array && ref.data.length > 0) {
    return ref.data;
  }
  if (typeof ref.data === "string" && ref.data.length > 0) {
    return base64ToBytes(ref.data);
  }

  const uri = ref.uri ?? "";
  if (!uri) return new Uint8Array();

  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma === -1) throw new Error(`Malformed data URI: ${uri.slice(0, 32)}…`);
    return base64ToBytes(uri.slice(comma + 1));
  }

  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored && stored.length > 0) return new Uint8Array(stored);
  }

  if (uri.startsWith("file://") && IS_NODE) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return new Uint8Array(await readFile(fileURLToPath(uri)));
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`Failed to fetch model (${res.status}): ${uri}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  return new Uint8Array();
}

export class RenderToImageNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.RenderToImage";
  static readonly title = "Render 3D To Image";
  static readonly description =
    "Render a 3D model (GLB/glTF) to an image with an orbit camera and studio lighting — no grid, axes, or gizmos.\n    3d, render, image, camera, light, snapshot, thumbnail, turntable\n\n    Use cases:\n    - Turn generated 3D models into shareable images\n    - Produce thumbnails for 3D asset libraries\n    - Feed rendered views into image models (img2img, upscaling)";
  static readonly platforms = NODE_AND_BROWSER_PLATFORMS;
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to render (GLB or glTF with embedded buffers)"
  })
  declare model: any;

  @prop({ type: "int", default: 1024, title: "Width", description: "Output image width in pixels", min: 16, max: 4096 })
  declare width: any;

  @prop({ type: "int", default: 1024, title: "Height", description: "Output image height in pixels", min: 16, max: 4096 })
  declare height: any;

  @prop({ type: "float", default: 45, title: "Azimuth", description: "Horizontal camera orbit angle in degrees (0 looks along -Z)", min: -360, max: 360 })
  declare azimuth: any;

  @prop({ type: "float", default: 25, title: "Elevation", description: "Camera angle above the horizon in degrees", min: -89, max: 89 })
  declare elevation: any;

  @prop({ type: "float", default: 35, title: "Field of View", description: "Vertical field of view in degrees", min: 5, max: 120 })
  declare fov: any;

  @prop({ type: "float", default: 1, title: "Zoom", description: "Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther", min: 0.1, max: 10 })
  declare zoom: any;

  @prop({
    type: "enum",
    default: "studio",
    title: "Lighting",
    description: "Lighting preset: studio (key/fill/rim), soft (hemisphere), or flat (ambient only)",
    values: ["studio", "soft", "flat"]
  })
  declare lighting: any;

  @prop({ type: "float", default: 1, title: "Light Intensity", description: "Multiplier applied to all lights in the preset", min: 0, max: 10 })
  declare light_intensity: any;

  @prop({ type: "str", default: "#ffffff", title: "Background Color", description: "Background color (CSS color); ignored when Transparent is on" })
  declare background_color: any;

  @prop({ type: "bool", default: false, title: "Transparent", description: "Render on a transparent background (PNG alpha)" })
  declare transparent: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const model = (this.model ?? {}) as Model3DRefLike;
    const format = String(model.format ?? "").toLowerCase();
    if (!RENDERABLE_FORMATS.has(format)) {
      throw new Error(
        `RenderToImage supports GLB/glTF, got "${format}" — convert it first (Format Converter)`
      );
    }

    const bytes = await resolveModelBytes(model, context);
    if (bytes.length === 0) {
      throw new Error(
        "RenderToImage: model input is empty — connect a 3D model (GLB)"
      );
    }

    const options: Render3DOptions = {
      width: Number(this.width ?? 1024),
      height: Number(this.height ?? 1024),
      azimuthDeg: Number(this.azimuth ?? 45),
      elevationDeg: Number(this.elevation ?? 25),
      fovDeg: Number(this.fov ?? 35),
      zoom: Number(this.zoom ?? 1),
      lighting: String(this.lighting ?? "studio") as LightingPreset,
      lightIntensity: Number(this.light_intensity ?? 1),
      backgroundColor: String(this.background_color ?? "#ffffff"),
      transparent: this.transparent === true
    };

    let png: Uint8Array;
    if (IS_NODE) {
      // @vite-ignore keeps the headless driver (node:fs, chrome-launcher) out
      // of browser bundles; esbuild still follows it for the server bundle.
      const headless = (await import(
        /* @vite-ignore */ "./render3d-headless.js"
      )) as typeof import("./render3d-headless.js");
      png = await headless.renderGlbHeadless(bytes, options);
    } else {
      const core = await import("./render3d-core.js");
      png = await core.renderGlbToPng(bytes, options);
    }

    return {
      output: {
        type: "image",
        uri: "",
        asset_id: null,
        data: bytesToBase64(png)
      }
    };
  }
}

export const MODEL3D_RENDER_NODES = [RenderToImageNode] as const;
