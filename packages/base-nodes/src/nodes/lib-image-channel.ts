/**
 * `lib.image.channel.*` — RGBA channel manipulation. Shuffle permutes
 * channels (e.g. RGB↔BGR, alpha→grayscale). Merge takes RGB from one image
 * and a chosen channel of another image as the new alpha. GPU-backed.
 *
 * Single-channel extraction lives at `nodetool.image.Channels` (existing
 * sharp-based node) — these two cover the cases that one can't.
 */

import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  colorChannelShuffleV1,
  colorChannelMergeV1
} from "@nodetool-ai/gpu/pool";
import {
  IMAGE_PROP,
  extraImageProp,
  intProp,
  runShaderNode
} from "./lib-shader-utils.js";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

class ChannelShuffleNode extends BaseNode {
  static readonly nodeType = "lib.image.channel.Shuffle";
  static readonly title = "Channel Shuffle";
  static readonly description =
    "Permute RGBA channels. Each output channel picks any input channel (0=R, 1=G, 2=B, 3=A).\n    image, channels, swap, rgba";
  static readonly inputFields = ["image"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorChannelShuffleV1,
      {
        rFrom: num(props.r_from, 0),
        gFrom: num(props.g_from, 1),
        bFrom: num(props.b_from, 2),
        aFrom: num(props.a_from, 3)
      },
      props.image,
      {},
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ChannelShuffleNode, "image", IMAGE_PROP);
registerDeclaredProperty(ChannelShuffleNode, "r_from", intProp(0, { min: 0, max: 3, label: "R from" }));
registerDeclaredProperty(ChannelShuffleNode, "g_from", intProp(1, { min: 0, max: 3, label: "G from" }));
registerDeclaredProperty(ChannelShuffleNode, "b_from", intProp(2, { min: 0, max: 3, label: "B from" }));
registerDeclaredProperty(ChannelShuffleNode, "a_from", intProp(3, { min: 0, max: 3, label: "A from" }));

class ChannelMergeNode extends BaseNode {
  static readonly nodeType = "lib.image.channel.Merge";
  static readonly title = "Channel Merge";
  static readonly description =
    "Take RGB from one image and a selectable channel of another as the new alpha.\n    image, channels, merge, alpha";
  static readonly inputFields = ["image", "alpha"];
  static readonly metadataOutputTypes = { output: "image" };

  async process(context?: ProcessingContext): Promise<{ output: ImageRef }> {
    const props = this.serialize() as Record<string, unknown>;
    const output = await runShaderNode(
      colorChannelMergeV1,
      { alphaChannel: num(props.alpha_channel, 3) },
      props.image,
      { extraInputs: { alpha: props.alpha } },
      context
    );
    return { output };
  }
}
registerDeclaredProperty(ChannelMergeNode, "image", IMAGE_PROP);
registerDeclaredProperty(
  ChannelMergeNode,
  "alpha",
  extraImageProp("Alpha source", "Image whose channel becomes the output's alpha")
);
registerDeclaredProperty(
  ChannelMergeNode,
  "alpha_channel",
  intProp(3, { min: 0, max: 4, label: "Alpha channel" })
);

export const LIB_IMAGE_CHANNEL_NODES: readonly NodeClass[] = [
  ChannelShuffleNode,
  ChannelMergeNode
];
export { ChannelShuffleNode, ChannelMergeNode };
