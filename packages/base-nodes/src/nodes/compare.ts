import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

type ImageLike = {
  data?: Uint8Array | string;
  uri?: string;
};

function toBytes(image: ImageLike | undefined): Uint8Array {
  if (!image) return new Uint8Array();
  if (image.data instanceof Uint8Array) return image.data;
  if (typeof image.data === "string") {
    return Uint8Array.from(Buffer.from(image.data, "base64"));
  }
  if (typeof image.uri === "string" && image.uri.startsWith("data:")) {
    const payload = image.uri.split(",", 2)[1] ?? "";
    return Uint8Array.from(Buffer.from(payload, "base64"));
  }
  return new Uint8Array();
}

export class CompareImagesNode extends BaseNode {
  static readonly nodeType = "nodetool.compare.CompareImages";
  static readonly title = "Compare Images";
  static readonly description =
    "Compare two images side-by-side with an interactive slider.\n    image, compare, comparison, diff, before, after, slider\n\n    Use this node to visually compare:\n    - Before/after processing results\n    - Different model outputs\n    - Original vs edited images\n    - A/B testing of image variations";
  static readonly metadataOutputTypes = {
    output: "none"
  };
  static readonly basicFields = ["image_a", "image_b"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image A",
    description: "First image (displayed on left/top)"
  })
  declare image_a: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image B",
    description: "Second image (displayed on right/bottom)"
  })
  declare image_b: any;

  @prop({
    type: "str",
    default: "A",
    title: "Label A",
    description: "Label for the first image"
  })
  declare label_a: any;

  @prop({
    type: "str",
    default: "B",
    title: "Label B",
    description: "Label for the second image"
  })
  declare label_b: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const imageA = this.image_a ?? this.image_a ?? {};
    const imageB = this.image_b ?? this.image_b ?? {};
    const a = toBytes(imageA as ImageLike);
    const b = toBytes(imageB as ImageLike);

    // Emit a PreviewUpdate for UI slider comparison if context supports it
    if (context && typeof context.emit === "function") {
      const nodeId = String(
        (this as any).__node_id ?? (this as any).name ?? (this as any).__node_name ?? ""
      );
      context.emit({
        type: "preview_update",
        node_id: nodeId,
        value: {
          type: "image_comparison",
          image_a: imageA,
          image_b: imageB,
          label_a: String(this.label_a ?? "A"),
          label_b: String(this.label_b ?? "B")
        }
      });
    }

    if (a.length === 0 && b.length === 0) {
      return { score: 1, equal: true };
    }
    if (a.length === 0 || b.length === 0) {
      return { score: 0, equal: false };
    }

    const len = Math.min(a.length, b.length);
    let same = 0;
    for (let i = 0; i < len; i += 1) {
      if (a[i] === b[i]) same += 1;
    }

    const lengthPenalty = len / Math.max(a.length, b.length);
    const score = (same / len) * lengthPenalty;
    return {
      score,
      equal: score === 1
    };
  }
}

export const COMPARE_NODES = [CompareImagesNode] as const;
