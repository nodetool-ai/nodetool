/**
 * Props and output shaping the ManimGX nodes share.
 *
 * `code` is an inline field, so the editor gives the node a code body. Every
 * node takes dynamic inputs: their values reach the scene as
 * `from nodetool_inputs import inputs`, media as file paths.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { bytesToBase64 } from "@nodetool-ai/nodes-utils";

import { ManimgxError } from "../run-manimgx.js";

export const EXAMPLE_SCENE = `import manimgx as m
from nodetool_inputs import inputs


class Title(m.Scene):
    def construct(self) -> None:
        title = m.Text(str(inputs.get("title", "Hello, ManimGX")))
        circle = m.Circle(radius=1.5, color=m.BLUE, fill_opacity=0.3)
        m.VGroup(circle, title).arrange(m.DOWN, buff=0.5)
        self.play(m.Create(circle), m.Write(title))
        self.wait(1)
`;

export type ImageOutput = {
  type: "image";
  uri: string;
  asset_id: null;
  data: string;
  content_type: string;
};

export type VideoOutput = {
  type: "video";
  uri: string;
  asset_id: null;
  data: string;
  content_type: string;
};

export function imageOutput(bytes: Uint8Array): ImageOutput {
  return { type: "image", uri: "", asset_id: null, data: bytesToBase64(bytes), content_type: "image/png" };
}

export function videoOutput(bytes: Uint8Array): VideoOutput {
  return { type: "video", uri: "", asset_id: null, data: bytesToBase64(bytes), content_type: "video/mp4" };
}

/** Run `step`, prefixing the node type onto any failure; an abort passes through. */
export async function runNodeStep<T>(
  nodeName: string,
  signal: AbortSignal | undefined,
  step: () => Promise<T>
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ManimgxError) throw new ManimgxError(`${nodeName}: ${message}`);
    if (error instanceof Error) {
      const wrapped = new Error(`${nodeName}: ${message}`);
      wrapped.name = error.name;
      throw wrapped;
    }
    throw new Error(`${nodeName}: ${message}`);
  }
}

export abstract class ManimgxSceneNode extends BaseNode {
  static readonly inlineFields = ["code"];
  static readonly inputFields = [];
  static readonly supportsDynamicInputs = true;

  @prop({
    type: "str",
    default: EXAMPLE_SCENE,
    title: "Code",
    description:
      "ManimGX scene in Python with Manim Community Edition's API: `import manimgx as m` and a class deriving " +
      "m.Scene (or m.ThreeDScene) whose construct() animates with self.play(...) and self.wait(...). " +
      "Values wired into the node's dynamic inputs are `from nodetool_inputs import inputs`, a dict; " +
      "image, audio and video inputs arrive as file paths."
  })
  declare code: string;

  @prop({
    type: "str",
    default: "",
    title: "Scene Name",
    description: "The Scene class to run. Empty runs the file's only scene."
  })
  declare scene_name: string;

  @prop({
    type: "int",
    default: 300,
    title: "Timeout",
    description: "Maximum run time in seconds",
    min: 1,
    max: 3600
  })
  declare timeout: number;

  /** The values wired into dynamic inputs, by handle name. */
  protected sceneInputs(): Record<string, unknown> {
    return Object.fromEntries(
      [...this.dynamicProps.entries()].filter(([name]) => !name.startsWith("_"))
    );
  }

  protected timeoutMs(): number {
    return Math.max(1, Math.round(Number(this.timeout ?? 300))) * 1000;
  }
}
