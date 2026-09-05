/**
 * `nodetool.model3d.RenderToImage` — 3D scene + camera → image.
 *
 * Hybrid node (issue #3532): in the browser runner it renders directly with
 * three.js on an `OffscreenCanvas` (no headless Chrome involved); on the Node
 * backend it drives a headless Chromium running the same render core
 * (`render3d-headless.ts`). Both paths share `render3d-core.ts`, so a
 * workflow produces the same pixels wherever it executes.
 *
 * Model bytes come from `resolveModelBytes` in `@nodetool-ai/nodes-utils`,
 * which stays browser-safe (no `node:path` at module scope).
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { NODE_AND_BROWSER_PLATFORMS } from "@nodetool-ai/protocol";
import { IS_NODE } from "@nodetool-ai/config";
import { bytesToBase64, resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { DEFAULT_MODEL_3D } from "./defaults.js";
import type { LightingPreset, Render3DOptions } from "./render3d-core.js";
import type { Model3DRefLike } from "./types.js";

const RENDERABLE_FORMATS = new Set(["", "glb", "gltf"]);

/** Output handles RenderToImageNode.process() emits. */
type RenderToImageNodeOutputs = {
  output: { type: string; uri: string; asset_id: null; data: string };
};

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
  declare model: Model3DRefLike;

  @prop({ type: "int", default: 1024, title: "Width", description: "Output image width in pixels", min: 16, max: 4096 })
  declare width: number;

  @prop({ type: "int", default: 1024, title: "Height", description: "Output image height in pixels", min: 16, max: 4096 })
  declare height: number;

  @prop({ type: "float", default: 45, title: "Azimuth", description: "Horizontal camera orbit angle in degrees (0 looks along -Z)", min: -360, max: 360 })
  declare azimuth: number;

  @prop({ type: "float", default: 25, title: "Elevation", description: "Camera angle above the horizon in degrees", min: -89, max: 89 })
  declare elevation: number;

  @prop({ type: "float", default: 35, title: "Field of View", description: "Vertical field of view in degrees", min: 5, max: 120 })
  declare fov: number;

  @prop({ type: "float", default: 1, title: "Zoom", description: "Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther", min: 0.1, max: 10 })
  declare zoom: number;

  @prop({
    type: "enum",
    default: "studio",
    title: "Lighting",
    description: "Lighting preset: studio (key/fill/rim), soft (hemisphere), or flat (ambient only)",
    values: ["studio", "soft", "flat"]
  })
  declare lighting: LightingPreset;

  @prop({ type: "float", default: 1, title: "Light Intensity", description: "Multiplier applied to all lights in the preset", min: 0, max: 10 })
  declare light_intensity: number;

  @prop({ type: "str", default: "#ffffff", title: "Background Color", description: "Background color (CSS color); ignored when Transparent is on" })
  declare background_color: string;

  @prop({ type: "bool", default: false, title: "Transparent", description: "Render on a transparent background (PNG alpha)" })
  declare transparent: boolean;

  async process(context?: ProcessingContext): Promise<RenderToImageNodeOutputs> {
    const model = this.model;
    const format = (model.format ?? "").toLowerCase();
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
      width: this.width,
      height: this.height,
      azimuthDeg: this.azimuth,
      elevationDeg: this.elevation,
      fovDeg: this.fov,
      zoom: this.zoom,
      lighting: this.lighting,
      lightIntensity: this.light_intensity,
      backgroundColor: this.background_color,
      transparent: this.transparent
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
