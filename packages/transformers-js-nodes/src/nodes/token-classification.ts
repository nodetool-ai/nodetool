import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  ensureArray,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";

const TJS_TYPE = "tjs.token_classification";

type TokenEntity = {
  entity?: string;
  entity_group?: string;
  word?: string;
  score?: number;
  start?: number;
  end?: number;
};

export class TokenClassificationNode extends BaseNode {
  static readonly nodeType = "transformers.TokenClassification";
  static readonly title = "Token Classification (NER)";
  static readonly description =
    "Run named-entity recognition or token-tagging via a Transformers.js token-classification pipeline.\n" +
    "nlp, ner, tokens, entities, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Extract names, locations and organizations\n" +
    "- Tag PII before storage or logging\n" +
    "- Build knowledge graphs from unstructured text";
  static readonly metadataOutputTypes = {
    entities: "list"
  };

  @prop({
    type: "str",
    default: "My name is Sarah and I live in London.",
    title: "Text",
    description: "Text to extract entities from."
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
    type: "enum",
    default: "simple",
    title: "Aggregation Strategy",
    description: "How to merge subword tokens into entity spans.",
    values: ["none", "simple", "first", "average", "max"]
  })
  declare aggregation_strategy: any;

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
      task: "token-classification",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<TokenEntity | TokenEntity[]>;

    const opts: Record<string, unknown> = {};
    const aggregation = asString(this.aggregation_strategy, "simple");
    if (aggregation && aggregation !== "none") {
      opts.aggregation_strategy = aggregation;
    }

    const raw = await pipeline(text, opts);
    return { entities: ensureArray<TokenEntity>(raw) };
  }
}

export const TOKEN_CLASSIFICATION_NODES: readonly NodeClass[] = [
  TokenClassificationNode
];
