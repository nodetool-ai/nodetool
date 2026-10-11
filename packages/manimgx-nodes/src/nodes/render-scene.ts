/**
 * `nodetool.manimgx.RenderScene` — ManimGX scene source → MP4 video.
 *
 * Runs `manimgx render` and returns the video inline, like the video nodes,
 * so downstream save nodes decide persistence. The storyboard ManimGX writes
 * beside every render (the frame at each play's end, layout problems
 * outlined) and its layout report come out too, as do subtitles when the
 * scene speaks or has subcaptions. A scene that fails throws its traceback.
 */

import { prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  MANIMGX_PRESETS,
  ManimgxError,
  runManimgx,
  type ManimgxPreset,
  type ManimgxRenderSettings
} from "../run-manimgx.js";
import {
  ManimgxSceneNode,
  imageOutput,
  runNodeStep,
  videoOutput,
  type ImageOutput,
  type VideoOutput
} from "./scene-base.js";

const NODE_NAME = "nodetool.manimgx.RenderScene";

type RenderSceneOutputs = {
  video: VideoOutput;
  storyboard: ImageOutput[];
  report: string;
  subtitles: string;
  duration: number;
};

export class RenderSceneNode extends ManimgxSceneNode {
  static readonly nodeType = "nodetool.manimgx.RenderScene";
  static readonly title = "Render ManimGX Scene";
  static readonly description =
    "Render a ManimGX scene, written in Python with Manim Community Edition's API, to an MP4 video. 2D and 3D math animation: equations (LaTeX or Typst), plots, geometry, surfaces and moving cameras, on a Rust GPU engine.\n    manim, manimgx, animation, math, 3d, explainer, equation, latex, plot, video, python\n\n    Use cases:\n    - Animate an equation, proof or algorithm for an explainer video\n    - Turn data wired into the node into an animated chart\n    - Render 3D surfaces and camera moves for a title sequence";
  static readonly metadataOutputTypes = {
    video: "video",
    storyboard: "list[image]",
    report: "str",
    subtitles: "str",
    duration: "float"
  };

  @prop({ type: "int", default: 1920, title: "Width", description: "Video width in pixels (rounded up to even)", min: 16, max: 7680 })
  declare width: number;

  @prop({ type: "int", default: 1080, title: "Height", description: "Video height in pixels (rounded up to even)", min: 16, max: 4320 })
  declare height: number;

  @prop({ type: "int", default: 30, title: "FPS", description: "Frames per second; motion keeps its timing at any rate", min: 1, max: 120 })
  declare fps: number;

  @prop({
    type: "enum",
    default: "medium",
    title: "Preset",
    description: "x264 encoding speed: faster presets encode sooner but write larger files",
    values: [...MANIMGX_PRESETS]
  })
  declare preset: ManimgxPreset;

  @prop({ type: "float", default: 23, title: "Quality (CRF)", description: "x264 constant rate factor: lower is higher quality and larger files", min: 0, max: 51 })
  declare crf: number;

  async process(context?: ProcessingContext): Promise<RenderSceneOutputs> {
    const settings: ManimgxRenderSettings = {
      width: Number(this.width ?? 1920),
      height: Number(this.height ?? 1080),
      fps: Number(this.fps ?? 30),
      preset: this.preset ?? "medium",
      crf: Number(this.crf ?? 23)
    };
    return runNodeStep(NODE_NAME, context?.signal, async () => {
      const result = await runManimgx(
        context,
        { code: String(this.code ?? ""), sceneName: this.scene_name, inputs: this.sceneInputs() },
        { command: "render", settings },
        { timeoutMs: this.timeoutMs(), signal: context?.signal }
      );
      if (!result.ok || !result.video) {
        throw new ManimgxError(`the scene failed:\n${result.report}`);
      }
      return {
        video: videoOutput(result.video),
        storyboard: result.storyboards.map(imageOutput),
        report: result.report,
        subtitles: result.subtitles,
        duration: result.duration
      };
    });
  }
}

export const MANIMGX_RENDER_NODES = [RenderSceneNode] as const;
