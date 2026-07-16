import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";

type ImageLike = {
  data?: Uint8Array | string | null;
  uri?: string | null;
  asset_id?: string | number | null;
};

/** Inline bytes carried by the ref itself (raw `data` or a `data:` URI). */
function inlineBytes(image: ImageLike | undefined): Uint8Array {
  if (!image) return new Uint8Array();
  if (image.data instanceof Uint8Array) return image.data;
  if (typeof image.data === "string" && image.data.length > 0) {
    return Uint8Array.from(Buffer.from(image.data, "base64"));
  }
  if (typeof image.uri === "string" && image.uri.startsWith("data:")) {
    const payload = image.uri.split(",", 2)[1] ?? "";
    return Uint8Array.from(Buffer.from(payload, "base64"));
  }
  return new Uint8Array();
}

/** Non-`data:` URI that identifies the ref (empty string when absent). */
function refUri(image: ImageLike | undefined): string {
  const uri = image?.uri;
  if (typeof uri === "string" && uri !== "" && !uri.startsWith("data:")) {
    return uri;
  }
  return "";
}

/** Asset id that identifies the ref (empty string when absent). */
function refAssetId(image: ImageLike | undefined): string {
  const id = image?.asset_id;
  if (typeof id === "string" && id !== "") return id;
  if (typeof id === "number") return String(id);
  return "";
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class CompareImagesNode extends BaseNode {
  static readonly nodeType = "nodetool.compare.CompareImages";
  static readonly title = "Compare Images";
  static readonly description =
    "Compare two images side-by-side with an interactive slider.\n    image, compare, comparison, diff, before, after, slider\n\n    Use this node to visually compare:\n    - Before/after processing results\n    - Different model outputs\n    - Original vs edited images\n    - A/B testing of image variations\n\n    The `equal` output reports whether the two refs are the same image by\n    identity (same inline bytes, same URI, or same asset id); it is not a\n    visual/perceptual similarity measure.";
  // The `comparison` output carries the side-by-side snapshot consumed by the
  // node body. `equal`/`score` are a binary identity indicator, NOT a
  // similarity metric: `score` is 1 when the refs are the same image by
  // identity (exact inline bytes, same non-data URI, or same asset id) and 0
  // otherwise. Output names/types are unchanged for compatibility.
  static readonly metadataOutputTypes = {
    comparison: "any",
    score: "float",
    equal: "bool"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["image_a", "image_b"];

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
    const imageA = this.image_a ?? {};
    const imageB = this.image_b ?? {};

    // Build the comparison snapshot the UI slider consumes. Images are
    // normalized (asset URIs resolved, in-memory bytes materialized) so
    // the client can render without extra round-trips.
    const normalize =
      context && typeof context.normalizeOutputValue === "function"
        ? context.normalizeOutputValue.bind(context)
        : async (value: unknown) => value;
    const [normalizedA, normalizedB] = await Promise.all([
      normalize(imageA),
      normalize(imageB)
    ]);
    const comparison = {
      type: "image_comparison",
      image_a: normalizedA,
      image_b: normalizedB,
      label_a: String(this.label_a ?? "A"),
      label_b: String(this.label_b ?? "B")
    };

    // Identity comparison. `score`/`equal` are a binary "same image?" signal,
    // not a similarity metric — comparing compressed-encoding bytes positionally
    // would be noise, and two refs that only carry a URI/asset id have no bytes
    // to compare at all.
    const aBytes = inlineBytes(imageA as ImageLike);
    const bBytes = inlineBytes(imageB as ImageLike);
    const aHasBytes = aBytes.length > 0;
    const bHasBytes = bBytes.length > 0;
    const aUri = refUri(imageA as ImageLike);
    const bUri = refUri(imageB as ImageLike);
    const aAsset = refAssetId(imageA as ImageLike);
    const bAsset = refAssetId(imageB as ImageLike);

    let equal: boolean;
    if (aHasBytes && bHasBytes) {
      // Both inline — exact byte equality.
      equal = bytesEqual(aBytes, bBytes);
    } else if (aHasBytes || bHasBytes) {
      // One has bytes, the other only a reference — not comparable.
      equal = false;
    } else if (aAsset && bAsset) {
      // Both reference an asset — same asset id means same image.
      equal = aAsset === bAsset;
    } else if (aUri && bUri) {
      // Both reference a URI — same URI means same image.
      equal = aUri === bUri;
    } else if (!aUri && !aAsset && !bUri && !bAsset) {
      // Two genuinely empty (unwired) inputs.
      equal = true;
    } else {
      // Mismatched or partial identity (e.g. one asset id vs one URI, or one
      // empty and one populated) — not comparable.
      equal = false;
    }

    return { comparison, score: equal ? 1 : 0, equal };
  }
}

export const COMPARE_NODES = tagAsUniversal([CompareImagesNode]);
