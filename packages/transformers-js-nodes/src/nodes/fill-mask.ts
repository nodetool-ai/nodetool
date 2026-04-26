import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asNumber,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.fill_mask";

type FillMaskResult = {
  sequence?: string;
  score?: number;
  token?: number;
  token_str?: string;
};

export class FillMaskNode extends BaseNode {
  static readonly nodeType = "transformers.FillMask";
  static readonly title = "Fill Mask";
  static readonly description =
    "Predict masked tokens in a sentence using a Transformers.js fill-mask pipeline.\n" +
    "nlp, mask, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Auto-complete missing words\n" +
    "- Probe a model's lexical knowledge\n" +
    "- Build cloze-style test items";
  static readonly metadataOutputTypes = {
    top: "str",
    results: "list"
  };

  @prop({
    type: "str",
    default: "The quick brown [MASK] jumps over the lazy dog.",
    title: "Text",
    description: "Text containing a single mask token (e.g. [MASK] or <mask>)."
  })
  declare text: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 5,
    title: "Top K",
    description: "Number of candidate fill-ins to return.",
    min: 1,
    max: 50
  })
  declare top_k: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(): Promise<Record<string, unknown>> {
    const text = asString(this.text);
    if (!text) throw new Error("Text is required");

    const pipeline = (await getPipeline({
      task: "fill-mask",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<FillMaskResult | FillMaskResult[]>;

    const raw = await pipeline(text, { top_k: asNumber(this.top_k, 5) });
    const results = ensureArray<FillMaskResult>(raw);
    return {
      top: results[0]?.token_str ?? "",
      results
    };
  }
}

export const FILL_MASK_NODES: readonly NodeClass[] = [FillMaskNode];
