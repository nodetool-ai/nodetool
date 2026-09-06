/**
 * The `model3d` layers of a preview pass, drawn before the first frame is
 * composited (D5, host 2).
 *
 * A 3D layer is the one layer kind this path cannot draw itself: there is no
 * WebGL behind `@napi-rs/canvas`. So the pass collects every 3D layer of every
 * requested instant up front, groups them by the glTF and the session options
 * that fix a renderer — lighting, intensity, background, animation selection —
 * and hands each group to one headless Chromium, which loads the model once and
 * returns one PNG per frame. The PNGs decode with `loadImage` and join the
 * layer list exactly the way a rasterized shape does.
 *
 * Grouping is what keeps this affordable: a Chromium launch costs about a
 * second, so a turntable previewed at six timecodes must be one launch and six
 * frames, never six launches (R3).
 *
 * No Chrome on the host — or a launch that fails — is not an error the pass
 * throws. The group's layers are skipped and reported as `model3d_unavailable`,
 * so an agent reading the report cannot mistake a missing renderer for an
 * empty clip.
 */

import { loadImage } from "@napi-rs/canvas";
import type {
  ClipModel3DCamera,
  ClipModel3DStyle
} from "@nodetool-ai/timeline";
import type { ActiveLayer } from "@nodetool-ai/timeline/scene";
import type {
  Model3DRenderFrame,
  Model3DSessionOptions
} from "@nodetool-ai/video-nodes/nodes/model3d/render3d-core";

/** A decoded PNG: what `loadImage` hands back, which is what `drawImage` takes. */
export type Model3DImage = Awaited<ReturnType<typeof loadImage>>;

/** One 3D layer's pixels, or why the renderer produced none. */
export type Model3DPixels =
  | { image: Model3DImage }
  | { unavailable: string };

/** The session options a clip's style fixes; two layers share a render only when these match. */
export function sessionOptionsFor(
  style: ClipModel3DStyle
): Model3DSessionOptions {
  return {
    lighting: style.lighting,
    lightIntensity: style.lightIntensity,
    background: style.background,
    animation: style.animation
  };
}

/**
 * Every `model3d` layer of a resolved layer set, matte sources included: a
 * matte draws to have its channel read, so it needs pixels like any other.
 */
export function collectModel3DLayers(
  layers: readonly ActiveLayer[]
): ActiveLayer[] {
  const found: ActiveLayer[] = [];
  const walk = (layer: ActiveLayer): void => {
    if (layer.kind === "model3d") found.push(layer);
    if (layer.matte) walk(layer.matte.layer);
  };
  for (const layer of layers) walk(layer);
  return found;
}

/** The renderer's identity: the model, and everything the session fixes. */
function groupKey(assetId: string, options: Model3DSessionOptions): string {
  const background = options.background.transparent
    ? "transparent"
    : options.background.color;
  const animation = options.animation;
  return [
    assetId,
    options.lighting,
    options.lightIntensity,
    background,
    animation.clipName ?? "*",
    animation.loop ? "loop" : "hold",
    animation.speed
  ].join("|");
}

/** One drawn picture's identity within a group: the pose and the instant. */
function frameKey(camera: ClipModel3DCamera, timeSec: number): string {
  return [
    camera.mode,
    camera.azimuthDeg,
    camera.elevationDeg,
    camera.fovDeg,
    camera.zoom,
    camera.targetOffset?.join(",") ?? "",
    camera.sceneCameraName ?? "",
    timeSec
  ].join("|");
}

/** One glTF plus one set of session options: a single headless render. */
interface RenderGroup {
  assetId: string;
  options: Model3DSessionOptions;
  frames: Model3DRenderFrame[];
  /** Result keys, parallel to `frames`. */
  keys: string[];
}

export interface Model3DPrerendererOptions {
  /** Pixel size of each rendered layer — the frame's, as a raster layer's is. */
  width: number;
  height: number;
  /** The pass's asset reader, so a GLB is fetched once for the whole pass. */
  loadAsset: (assetId: string) => Promise<Uint8Array | null>;
}

/**
 * Collect the 3D layers of a pass, render each group once, and hand the pixels
 * back per layer. `request` before `run`; `get` after it.
 */
export class Model3DPrerenderer {
  private readonly groups = new Map<string, RenderGroup>();
  private readonly results = new Map<string, Model3DPixels>();
  /** Frame keys already registered, so a pose repeated across frames renders once. */
  private readonly requested = new Set<string>();

  constructor(private readonly options: Model3DPrerendererOptions) {}

  request(
    assetId: string,
    session: Model3DSessionOptions,
    camera: ClipModel3DCamera,
    timeSec: number
  ): void {
    const id = groupKey(assetId, session);
    const key = `${id}|${frameKey(camera, timeSec)}`;
    if (this.requested.has(key)) return;
    this.requested.add(key);
    let group = this.groups.get(id);
    if (!group) {
      group = { assetId, options: session, frames: [], keys: [] };
      this.groups.set(id, group);
    }
    group.frames.push({
      timeSec,
      camera,
      width: this.options.width,
      height: this.options.height
    });
    group.keys.push(key);
  }

  /** Render every group: one Chromium launch each, one PNG per requested frame. */
  async run(): Promise<void> {
    if (this.groups.size === 0) return;

    // Imported here and not at module scope so a document with no 3D clip
    // never loads three.js, chrome-launcher or the render page bundle.
    let headless:
      | typeof import("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless")
      | null = null;
    let loadError: unknown;
    try {
      headless = await import(
        "@nodetool-ai/video-nodes/nodes/model3d/render3d-headless"
      );
    } catch (error) {
      loadError = error;
    }
    if (!headless) {
      // The renderer itself could not be loaded, so no group can draw.
      this.failAll([...this.groups.values()], loadError);
      return;
    }
    const render = headless.renderGlbFramesHeadless;

    for (const group of this.groups.values()) {
      const bytes = await this.options.loadAsset(group.assetId);
      // A GLB that would not read is an asset problem, not a renderer one: the
      // pass reports it the way it reports an unreadable image.
      if (!bytes || bytes.byteLength === 0) continue;
      try {
        const pngs = await render(bytes, group.options, group.frames);
        if (pngs.length !== group.frames.length) {
          throw new Error(
            `the renderer returned ${pngs.length} images for ${group.frames.length} frames`
          );
        }
        for (const [index, png] of pngs.entries()) {
          const image = await loadImage(Buffer.from(png));
          this.results.set(group.keys[index], { image });
        }
      } catch (error) {
        this.failAll([group], error);
      }
    }
  }

  /** The pixels for one layer, or undefined when this instant was never requested. */
  get(
    assetId: string,
    session: Model3DSessionOptions,
    camera: ClipModel3DCamera,
    timeSec: number
  ): Model3DPixels | undefined {
    return this.results.get(
      `${groupKey(assetId, session)}|${frameKey(camera, timeSec)}`
    );
  }

  /** Mark every frame of these groups unavailable, naming what went wrong. */
  private failAll(groups: readonly RenderGroup[], error: unknown): void {
    const detail =
      (error instanceof Error ? error.message : String(error)).trim() ||
      "it failed with no message";
    for (const group of groups) {
      for (const key of group.keys) {
        this.results.set(key, { unavailable: detail });
      }
    }
  }
}
