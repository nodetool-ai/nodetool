import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
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

const TJS_TYPE = "tjs.text_generation";

type GenerationResult = { generated_text: string | unknown };

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const last = value[value.length - 1] as Record<string, unknown> | undefined;
    if (last && typeof last.content === "string") return last.content;
  }
  return "";
}

export class TextGenerationNode extends BaseNode {
  static readonly nodeType = "transformers.TextGeneration";
  static readonly title = "Text Generation";
  static readonly description =
    "Generate text completions using a Transformers.js text-generation pipeline.\n" +
    "nlp, generation, llm, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Run small open-source LLMs offline\n" +
    "- Prototype completions without an API key\n" +
    "- Generate text in environments with no network";
  static readonly metadataOutputTypes = { text: "str" };

  @prop({
    type: "str",
    default: "Once upon a time",
    title: "Prompt",
    description: "Prompt for the language model."
  })
  declare prompt: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 128,
    title: "Max New Tokens",
    description: "Maximum number of tokens to generate after the prompt.",
    min: 1,
    max: 4096
  })
  declare max_new_tokens: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Temperature",
    description: "Sampling temperature (1.0 = neutral).",
    min: 0.0,
    max: 5.0
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Top P",
    description: "Nucleus sampling probability mass (1.0 = disabled).",
    min: 0.0,
    max: 1.0
  })
  declare top_p: any;

  @prop({
    type: "int",
    default: 50,
    title: "Top K",
    description: "Limit sampling to the K most likely tokens.",
    min: 0,
    max: 1000
  })
  declare top_k: any;

  @prop({
    type: "bool",
    default: true,
    title: "Do Sample",
    description: "Sample tokens instead of greedy decoding."
  })
  declare do_sample: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Repetition Penalty",
    description: "Penalty applied to repeated tokens (>1 discourages repetition).",
    min: 0.5,
    max: 5.0
  })
  declare repetition_penalty: any;

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
    const prompt = asString(this.prompt);
    if (!prompt) throw new Error("Prompt is required");

    const pipeline = (await getPipeline({
      task: "text-generation",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<GenerationResult | GenerationResult[]>;

    const opts: Record<string, unknown> = {
      max_new_tokens: asNumber(this.max_new_tokens, 128),
      temperature: asNumber(this.temperature, 1.0),
      top_p: asNumber(this.top_p, 1.0),
      do_sample: Boolean(this.do_sample),
      repetition_penalty: asNumber(this.repetition_penalty, 1.0),
      return_full_text: false
    };
    const topK = asNumber(this.top_k, 50);
    if (topK > 0) opts.top_k = topK;

    const raw = await pipeline(prompt, opts);
    const first = ensureArray<GenerationResult>(raw)[0];
    return { text: extractText(first?.generated_text) };
  }
}

export const TEXT_GENERATION_NODES: readonly NodeClass[] = [TextGenerationNode];
