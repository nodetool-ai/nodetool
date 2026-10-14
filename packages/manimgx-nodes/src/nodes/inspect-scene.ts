/**
 * `nodetool.manimgx.InspectScene` — check a ManimGX scene without video.
 *
 * Runs `manimgx inspect`: the storyboard (the frame at each play's end, or at
 * the times asked for, layout problems outlined and numbered), the timeline
 * of plays with their source lines, and 2D layout checks (clipped content,
 * overlapping text, small labels). This is the feedback half of an authoring
 * loop, so a scene that fails is a result here, not an error: `ok` is false
 * and `report` carries the traceback with ManimGX's hint.
 */

import { prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { runManimgx } from "../run-manimgx.js";
import {
  ManimgxSceneNode,
  imageOutput,
  runNodeStep,
  type ImageOutput
} from "./scene-base.js";

const NODE_NAME = "nodetool.manimgx.InspectScene";

type InspectSceneOutputs = {
  ok: boolean;
  problems: boolean;
  report: string;
  storyboard: ImageOutput[];
  duration: number;
};

export class InspectSceneNode extends ManimgxSceneNode {
  static readonly nodeType = "nodetool.manimgx.InspectScene";
  static readonly title = "Inspect ManimGX Scene";
  static readonly description =
    "Check a ManimGX scene without rendering video: a storyboard of key frames, the timeline of plays, and 2D layout problems such as clipped content or overlapping text.\n    manim, manimgx, inspect, storyboard, layout, check, preview, animation, python\n\n    Use cases:\n    - Preview a scene's key frames before a full render\n    - Feed layout problems and tracebacks back to an LLM that writes the scene\n    - Grab stills at chosen times";
  static readonly metadataOutputTypes = {
    ok: "bool",
    problems: "bool",
    report: "str",
    storyboard: "list[image]",
    duration: "float"
  };

  @prop({
    type: "str",
    default: "",
    title: "Times",
    description: "Seconds from the start, or 'end', separated by commas (e.g. 0.5,2,end). Empty samples each play's end."
  })
  declare times: string;

  async process(context?: ProcessingContext): Promise<InspectSceneOutputs> {
    return runNodeStep(NODE_NAME, context?.signal, async () => {
      const result = await runManimgx(
        context,
        { code: String(this.code ?? ""), sceneName: this.scene_name, inputs: this.sceneInputs() },
        { command: "inspect", times: this.times },
        { timeoutMs: this.timeoutMs(), signal: context?.signal }
      );
      return {
        ok: result.ok,
        problems: result.problems,
        report: result.report,
        storyboard: result.storyboards.map(imageOutput),
        duration: result.duration
      };
    });
  }
}

export const MANIMGX_INSPECT_NODES = [InspectSceneNode] as const;
