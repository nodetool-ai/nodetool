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

const TJS_TYPE = "tjs.summarization";

type SummaryResult = { summary_text: string };

export class SummarizationNode extends BaseNode {
  static readonly nodeType = "transformers.Summarization";
  static readonly title = "Summarization";
  static readonly description =
    "Summarize long text using a Transformers.js summarization pipeline.\n" +
    "nlp, summary, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Condense articles or meeting notes\n" +
    "- Generate TL;DR previews\n" +
    "- Pre-process documents for downstream LLMs";
  static readonly metadataOutputTypes = { summary: "str" };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to summarize."
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
    default: 130,
    title: "Max Length",
    description: "Maximum number of tokens in the generated summary.",
    min: 1,
    max: 4096
  })
  declare max_length: any;

  @prop({
    type: "int",
    default: 30,
    title: "Min Length",
    description: "Minimum number of tokens in the generated summary.",
    min: 0,
    max: 4096
  })
  declare min_length: any;

  @prop({
    type: "bool",
    default: false,
    title: "Do Sample",
    description: "Sample tokens instead of greedy decoding."
  })
  declare do_sample: any;

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
      task: "summarization",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<SummaryResult | SummaryResult[]>;

    const raw = await pipeline(text, {
      max_length: asNumber(this.max_length, 130),
      min_length: asNumber(this.min_length, 30),
      do_sample: Boolean(this.do_sample)
    });

    const first = ensureArray<SummaryResult>(raw)[0];
    return { summary: first?.summary_text ?? "" };
  }
}

export const SUMMARIZATION_NODES: readonly NodeClass[] = [SummarizationNode];
