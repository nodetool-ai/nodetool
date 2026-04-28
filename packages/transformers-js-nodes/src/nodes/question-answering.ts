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

const TJS_TYPE = "tjs.question_answering";

type QAResult = {
  answer: string;
  score: number;
  start?: number;
  end?: number;
};

export class QuestionAnsweringNode extends BaseNode {
  static readonly nodeType = "transformers.QuestionAnswering";
  static readonly title = "Question Answering";
  static readonly description =
    "Extract an answer span from a context paragraph using a Transformers.js question-answering pipeline.\n" +
    "nlp, qa, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Answer FAQs from documentation\n" +
    "- Extract facts from long passages\n" +
    "- Build retrieval-augmented chat tools";
  static readonly metadataOutputTypes = {
    answer: "str",
    score: "float",
    start: "int",
    end: "int",
    results: "list"
  };

  @prop({
    type: "str",
    default: "What is the capital of France?",
    title: "Question",
    description: "The question to answer."
  })
  declare question: any;

  @prop({
    type: "str",
    default: "Paris is the capital and most populous city of France.",
    title: "Context",
    description: "The passage that contains the answer."
  })
  declare context: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "int",
    default: 1,
    title: "Top K",
    description: "Number of candidate answers to return.",
    min: 1,
    max: 20
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
    const question = asString(this.question);
    const context = asString(this.context);
    if (!question) throw new Error("Question is required");
    if (!context) throw new Error("Context is required");

    const pipeline = (await getPipeline({
      task: "question-answering",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      question: string,
      context: string,
      opts?: Record<string, unknown>
    ) => Promise<QAResult | QAResult[]>;

    const topK = asNumber(this.top_k, 1);
    const raw = await pipeline(question, context, { top_k: topK });
    const results = ensureArray<QAResult>(raw);
    const top = results[0] ?? { answer: "", score: 0 };

    return {
      answer: top.answer,
      score: top.score,
      start: top.start ?? 0,
      end: top.end ?? 0,
      results
    };
  }
}

export const QUESTION_ANSWERING_NODES: readonly NodeClass[] = [
  QuestionAnsweringNode
];
