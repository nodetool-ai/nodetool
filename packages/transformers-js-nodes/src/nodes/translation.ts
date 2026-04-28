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

const TJS_TYPE = "tjs.translation";

type TranslationResult = { translation_text: string };

export class TranslationNode extends BaseNode {
  static readonly nodeType = "transformers.Translation";
  static readonly title = "Translation";
  static readonly description =
    "Translate text between languages using a Transformers.js translation pipeline.\n" +
    "nlp, translation, transformers, huggingface, multilingual\n\n" +
    "Use cases:\n" +
    "- Translate user content for localization\n" +
    "- Build multilingual chat or search\n" +
    "- Pre-process inputs for monolingual models";
  static readonly metadataOutputTypes = { translation: "str" };

  @prop({
    type: "str",
    default: "Hello, how are you?",
    title: "Text",
    description: "Source text to translate."
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
    type: "str",
    default: "eng_Latn",
    title: "Source Language",
    description:
      "Source language code understood by the model (e.g. NLLB BCP-47 codes)."
  })
  declare src_lang: any;

  @prop({
    type: "str",
    default: "fra_Latn",
    title: "Target Language",
    description: "Target language code understood by the model."
  })
  declare tgt_lang: any;

  @prop({
    type: "int",
    default: 256,
    title: "Max Length",
    description: "Maximum number of tokens in the translation.",
    min: 1,
    max: 4096
  })
  declare max_length: any;

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
      task: "translation",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<TranslationResult | TranslationResult[]>;

    const opts: Record<string, unknown> = {
      max_length: asNumber(this.max_length, 256)
    };
    const srcLang = asString(this.src_lang);
    const tgtLang = asString(this.tgt_lang);
    if (srcLang) opts.src_lang = srcLang;
    if (tgtLang) opts.tgt_lang = tgtLang;

    const raw = await pipeline(text, opts);
    const first = ensureArray<TranslationResult>(raw)[0];
    return { translation: first?.translation_text ?? "" };
  }
}

export const TRANSLATION_NODES: readonly NodeClass[] = [TranslationNode];
