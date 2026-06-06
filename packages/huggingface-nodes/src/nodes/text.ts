import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  cleanParams,
  getHfToken,
  hfChatCompletion,
  hfPipelineJson
} from "../huggingface-base.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Chat Completion
// ---------------------------------------------------------------------------
export class ChatCompletionNode extends BaseNode {
  static readonly nodeType = "huggingface.ChatCompletion";
  static readonly title = "Chat Completion";
  static readonly description =
    "Generate a chat response from a conversational LLM via Hugging Face Inference Providers.\n" +
    "text, chat, llm, completion, conversation, huggingface\n\n" +
    "Use cases:\n" +
    "- Answer questions with an open LLM\n" +
    "- Build conversational assistants\n" +
    "- Generate text with system instructions";
  static readonly inlineFields = ["prompt"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "meta-llama/Llama-3.1-8B-Instruct",
    title: "Model",
    description:
      "Conversational model repo id (e.g. meta-llama/Llama-3.1-8B-Instruct, Qwen/Qwen2.5-7B-Instruct, openai/gpt-oss-120b)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "System",
    description: "Optional system prompt setting the assistant's behavior."
  })
  declare system: any;

  @prop({
    type: "str",
    default: "Hello!",
    title: "Prompt",
    description: "The user message to send to the model."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 512,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate.",
    min: 1,
    max: 32768
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 0.7,
    title: "Temperature",
    description: "Sampling temperature (0-2). Higher is more random.",
    min: 0,
    max: 2
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Top P",
    description: "Nucleus sampling probability mass (0-1).",
    min: 0,
    max: 1
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const messages: Array<{ role: string; content: string }> = [];
    const system = String(this.system ?? "");
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const result = await hfChatCompletion(token, {
      model: String(this.model ?? "meta-llama/Llama-3.1-8B-Instruct"),
      messages,
      max_tokens: Number(this.max_tokens ?? 512),
      temperature: Number(this.temperature ?? 0.7),
      top_p: Number(this.top_p ?? 1.0)
    });

    return { output: result.content };
  }
}

// ---------------------------------------------------------------------------
// Text Generation
// ---------------------------------------------------------------------------
export class TextGenerationNode extends BaseNode {
  static readonly nodeType = "huggingface.TextGeneration";
  static readonly title = "Text Generation";
  static readonly description =
    "Continue / complete text from a prompt using a Hugging Face text-generation model.\n" +
    "text, generation, completion, llm, huggingface\n\n" +
    "Use cases:\n" +
    "- Continue a piece of writing\n" +
    "- Generate creative text\n" +
    "- Prototype with open models";
  static readonly inlineFields = ["prompt"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "HuggingFaceH4/zephyr-7b-beta",
    title: "Model",
    description: "Text-generation model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "Once upon a time",
    title: "Prompt",
    description: "The text prompt to continue."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 256,
    title: "Max New Tokens",
    description: "Maximum number of new tokens to generate.",
    min: 1,
    max: 8192
  })
  declare max_new_tokens: any;

  @prop({
    type: "float",
    default: 0.7,
    title: "Temperature",
    description: "Sampling temperature.",
    min: 0,
    max: 2
  })
  declare temperature: any;

  @prop({
    type: "bool",
    default: false,
    title: "Return Full Text",
    description: "Include the prompt in the returned text."
  })
  declare return_full_text: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const result = await hfPipelineJson<
      Array<{ generated_text?: string }> | { generated_text?: string }
    >(token, String(this.model ?? "HuggingFaceH4/zephyr-7b-beta"), {
      inputs: prompt,
      parameters: cleanParams({
        max_new_tokens: Number(this.max_new_tokens ?? 256),
        temperature: Number(this.temperature ?? 0.7),
        return_full_text: Boolean(this.return_full_text ?? false)
      })
    });

    const first = Array.isArray(result) ? result[0] : result;
    return { output: String(first?.generated_text ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------
export class SummarizationNode extends BaseNode {
  static readonly nodeType = "huggingface.Summarization";
  static readonly title = "Summarization";
  static readonly description =
    "Produce a shorter version of a document while preserving key information.\n" +
    "text, summarization, summary, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Summarize articles or reports\n" +
    "- Create TL;DRs\n" +
    "- Condense meeting notes";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "facebook/bart-large-cnn",
    title: "Model",
    description: "Summarization model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to summarize."
  })
  declare inputs: any;

  @prop({
    type: "int",
    default: 0,
    title: "Max Length",
    description: "Maximum length of the summary in tokens (0 = model default).",
    min: 0,
    max: 2048
  })
  declare max_length: any;

  @prop({
    type: "int",
    default: 0,
    title: "Min Length",
    description: "Minimum length of the summary in tokens (0 = model default).",
    min: 0,
    max: 2048
  })
  declare min_length: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const maxLength = Number(this.max_length ?? 0);
    const minLength = Number(this.min_length ?? 0);

    const result = await hfPipelineJson<
      Array<{ summary_text?: string }> | { summary_text?: string }
    >(token, String(this.model ?? "facebook/bart-large-cnn"), {
      inputs: text,
      parameters: cleanParams({
        max_length: maxLength > 0 ? maxLength : undefined,
        min_length: minLength > 0 ? minLength : undefined
      })
    });

    const first = Array.isArray(result) ? result[0] : result;
    return { output: String(first?.summary_text ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------
export class TranslationNode extends BaseNode {
  static readonly nodeType = "huggingface.Translation";
  static readonly title = "Translation";
  static readonly description =
    "Translate text from one language to another.\n" +
    "text, translation, language, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Translate documents\n" +
    "- Localize content\n" +
    "- Build multilingual apps";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "facebook/nllb-200-distilled-600M",
    title: "Model",
    description:
      "Translation model repo id (e.g. facebook/nllb-200-distilled-600M, Helsinki-NLP/opus-mt-en-fr)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to translate."
  })
  declare inputs: any;

  @prop({
    type: "str",
    default: "",
    title: "Source Language",
    description:
      "Optional source language code for multilingual models (e.g. eng_Latn)."
  })
  declare src_lang: any;

  @prop({
    type: "str",
    default: "",
    title: "Target Language",
    description:
      "Optional target language code for multilingual models (e.g. fra_Latn)."
  })
  declare tgt_lang: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const result = await hfPipelineJson<
      Array<{ translation_text?: string }> | { translation_text?: string }
    >(token, String(this.model ?? "facebook/nllb-200-distilled-600M"), {
      inputs: text,
      parameters: cleanParams({
        src_lang: String(this.src_lang ?? ""),
        tgt_lang: String(this.tgt_lang ?? "")
      })
    });

    const first = Array.isArray(result) ? result[0] : result;
    return { output: String(first?.translation_text ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Fill Mask
// ---------------------------------------------------------------------------
export class FillMaskNode extends BaseNode {
  static readonly nodeType = "huggingface.FillMask";
  static readonly title = "Fill Mask";
  static readonly description =
    "Predict the masked token in a sequence.\n" +
    "text, fill-mask, masked-language-model, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Complete sentences with a missing word\n" +
    "- Probe what a language model knows\n" +
    "- Data augmentation";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", predictions: "list" };

  @prop({
    type: "str",
    default: "bert-base-uncased",
    title: "Model",
    description: "Fill-mask model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "The capital of France is [MASK].",
    title: "Text",
    description:
      "Text containing a mask token (e.g. [MASK] for BERT, <mask> for RoBERTa)."
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const result = await hfPipelineJson<
      Array<{ sequence?: string; score?: number; token_str?: string }>
    >(token, String(this.model ?? "bert-base-uncased"), { inputs: text });

    const predictions = Array.isArray(result) ? result : [];
    return {
      output: String(predictions[0]?.token_str ?? "").trim(),
      predictions
    };
  }
}

// ---------------------------------------------------------------------------
// Question Answering
// ---------------------------------------------------------------------------
export class QuestionAnsweringNode extends BaseNode {
  static readonly nodeType = "huggingface.QuestionAnswering";
  static readonly title = "Question Answering";
  static readonly description =
    "Retrieve the answer to a question from a given context passage.\n" +
    "text, question-answering, qa, extractive, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Answer questions over a document\n" +
    "- Extract facts from text\n" +
    "- Build search-over-document features";
  static readonly inlineFields = ["question"];
  static readonly inputFields = ["context"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", score: "float" };

  @prop({
    type: "str",
    default: "deepset/roberta-base-squad2",
    title: "Model",
    description: "Question-answering model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Question",
    description: "The question to answer."
  })
  declare question: any;

  @prop({
    type: "str",
    default: "",
    title: "Context",
    description: "The passage that contains the answer."
  })
  declare context: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const question = String(this.question ?? "");
    const context = String(this.context ?? "");
    if (!question) throw new Error("Question cannot be empty");
    if (!context) throw new Error("Context cannot be empty");

    const result = await hfPipelineJson<{
      answer?: string;
      score?: number;
      start?: number;
      end?: number;
    }>(token, String(this.model ?? "deepset/roberta-base-squad2"), {
      inputs: { question, context }
    });

    return {
      output: String(result?.answer ?? ""),
      score: Number(result?.score ?? 0)
    };
  }
}

// ---------------------------------------------------------------------------
// Table Question Answering
// ---------------------------------------------------------------------------
export class TableQuestionAnsweringNode extends BaseNode {
  static readonly nodeType = "huggingface.TableQuestionAnswering";
  static readonly title = "Table Question Answering";
  static readonly description =
    "Answer a question about the data in a table.\n" +
    "text, table, question-answering, tabular, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Query spreadsheets in natural language\n" +
    "- Aggregate values from a table\n" +
    "- Build conversational data tools";
  static readonly inlineFields = ["question"];
  static readonly inputFields = ["table"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str",
    cells: "list",
    aggregator: "str"
  };

  @prop({
    type: "str",
    default: "google/tapas-base-finetuned-wtq",
    title: "Model",
    description: "Table-question-answering model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Question",
    description: "The question to ask about the table."
  })
  declare question: any;

  @prop({
    type: "dict",
    default: {},
    title: "Table",
    description:
      "The table as an object mapping each column name to an array of string cell values."
  })
  declare table: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const question = String(this.question ?? "");
    if (!question) throw new Error("Question cannot be empty");

    const rawTable = (this.table ?? {}) as Record<string, unknown>;
    // The API requires every cell to be a string.
    const table: Record<string, string[]> = {};
    for (const [col, values] of Object.entries(rawTable)) {
      table[col] = (Array.isArray(values) ? values : [values]).map((v) =>
        String(v)
      );
    }
    if (Object.keys(table).length === 0) {
      throw new Error("Table cannot be empty");
    }

    const result = await hfPipelineJson<{
      answer?: string;
      cells?: string[];
      aggregator?: string;
      coordinates?: number[][];
    }>(token, String(this.model ?? "google/tapas-base-finetuned-wtq"), {
      inputs: { query: question, table }
    });

    return {
      output: String(result?.answer ?? ""),
      cells: result?.cells ?? [],
      aggregator: String(result?.aggregator ?? "")
    };
  }
}

// ---------------------------------------------------------------------------
// Feature Extraction (embeddings)
// ---------------------------------------------------------------------------
export class FeatureExtractionNode extends BaseNode {
  static readonly nodeType = "huggingface.FeatureExtraction";
  static readonly title = "Feature Extraction";
  static readonly description =
    "Convert text into an embedding vector.\n" +
    "text, embedding, feature-extraction, vector, rag, huggingface\n\n" +
    "Use cases:\n" +
    "- Build semantic search / RAG\n" +
    "- Cluster or deduplicate documents\n" +
    "- Compute sentence similarity";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "list" };

  @prop({
    type: "str",
    default: "sentence-transformers/all-MiniLM-L6-v2",
    title: "Model",
    description: "Feature-extraction / embedding model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to embed."
  })
  declare inputs: any;

  @prop({
    type: "bool",
    default: false,
    title: "Normalize",
    description: "L2-normalize the returned embedding."
  })
  declare normalize: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const result = await hfPipelineJson<number[] | number[][]>(
      token,
      String(this.model ?? "sentence-transformers/all-MiniLM-L6-v2"),
      {
        inputs: text,
        ...(this.normalize ? { normalize: true } : {})
      }
    );

    return { output: result };
  }
}

// ---------------------------------------------------------------------------
// Text Classification
// ---------------------------------------------------------------------------
export class TextClassificationNode extends BaseNode {
  static readonly nodeType = "huggingface.TextClassification";
  static readonly title = "Text Classification";
  static readonly description =
    "Assign a label / class to a piece of text (e.g. sentiment).\n" +
    "text, classification, sentiment, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Sentiment analysis\n" +
    "- Topic / intent detection\n" +
    "- Content moderation";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", scores: "list" };

  @prop({
    type: "str",
    default: "distilbert-base-uncased-finetuned-sst-2-english",
    title: "Model",
    description: "Text-classification model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to classify."
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const result = await hfPipelineJson<
      Array<{ label?: string; score?: number }> | Array<Array<{ label?: string; score?: number }>>
    >(
      token,
      String(this.model ?? "distilbert-base-uncased-finetuned-sst-2-english"),
      { inputs: text }
    );

    // The API may return a flat list or a list-of-lists (one per input).
    const scores = Array.isArray(result[0]) ? (result[0] as Array<{ label?: string; score?: number }>) : (result as Array<{ label?: string; score?: number }>);
    return {
      output: String(scores[0]?.label ?? ""),
      scores
    };
  }
}

// ---------------------------------------------------------------------------
// Token Classification (NER)
// ---------------------------------------------------------------------------
export class TokenClassificationNode extends BaseNode {
  static readonly nodeType = "huggingface.TokenClassification";
  static readonly title = "Token Classification";
  static readonly description =
    "Assign a label to each token in a text (named-entity recognition).\n" +
    "text, token-classification, ner, entities, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Extract people, places, organizations\n" +
    "- Detect PII\n" +
    "- Part-of-speech tagging";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "list" };

  @prop({
    type: "str",
    default: "dslim/bert-base-NER",
    title: "Model",
    description: "Token-classification / NER model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to analyze."
  })
  declare inputs: any;

  @prop({
    type: "enum",
    default: "simple",
    title: "Aggregation",
    description: "How to group sub-word tokens into entities.",
    values: ["none", "simple", "first", "average", "max"]
  })
  declare aggregation_strategy: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const strategy = String(this.aggregation_strategy ?? "simple");
    const result = await hfPipelineJson<
      Array<Record<string, unknown>>
    >(token, String(this.model ?? "dslim/bert-base-NER"), {
      inputs: text,
      ...(strategy !== "none"
        ? { parameters: { aggregation_strategy: strategy } }
        : {})
    });

    return { output: Array.isArray(result) ? result : [] };
  }
}

// ---------------------------------------------------------------------------
// Zero Shot Classification
// ---------------------------------------------------------------------------
export class ZeroShotClassificationNode extends BaseNode {
  static readonly nodeType = "huggingface.ZeroShotClassification";
  static readonly title = "Zero Shot Classification";
  static readonly description =
    "Classify text into arbitrary labels without task-specific training.\n" +
    "text, zero-shot, classification, nlp, huggingface\n\n" +
    "Use cases:\n" +
    "- Classify into custom categories on the fly\n" +
    "- Intent detection without training data\n" +
    "- Flexible content tagging";
  static readonly inlineFields = ["inputs"];
  static readonly requiredSettings = ["HF_TOKEN"];
  static readonly metadataOutputTypes = { output: "str", scores: "list" };

  @prop({
    type: "str",
    default: "facebook/bart-large-mnli",
    title: "Model",
    description: "Zero-shot-classification model repo id."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to classify."
  })
  declare inputs: any;

  @prop({
    type: "str",
    default: "",
    title: "Candidate Labels",
    description: "Comma-separated list of candidate labels."
  })
  declare candidate_labels: any;

  @prop({
    type: "bool",
    default: false,
    title: "Multi Label",
    description: "Allow multiple labels to be true at once."
  })
  declare multi_label: any;

  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const text = String(this.inputs ?? "");
    if (!text) throw new Error("Text cannot be empty");

    const labels = String(this.candidate_labels ?? "")
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (labels.length === 0) {
      throw new Error("Provide at least one candidate label");
    }

    const result = await hfPipelineJson<
      | { labels?: string[]; scores?: number[]; sequence?: string }
      | Array<{ label?: string; score?: number }>
    >(token, String(this.model ?? "facebook/bart-large-mnli"), {
      inputs: text,
      parameters: {
        candidate_labels: labels,
        multi_label: Boolean(this.multi_label ?? false)
      }
    });

    // Newer providers return [{label, score}], the classic API returns
    // {labels, scores}. Normalize both into a sorted list.
    let scores: Array<{ label: string; score: number }>;
    if (Array.isArray(result)) {
      scores = result.map((r) => ({
        label: String(r.label ?? ""),
        score: Number(r.score ?? 0)
      }));
    } else {
      const ls = result.labels ?? [];
      const ss = result.scores ?? [];
      scores = ls.map((label, i) => ({ label, score: Number(ss[i] ?? 0) }));
    }
    scores.sort((a, b) => b.score - a.score);

    return { output: scores[0]?.label ?? "", scores };
  }
}

export const HUGGINGFACE_TEXT_NODES: readonly NodeClass[] = [
  ChatCompletionNode,
  TextGenerationNode,
  SummarizationNode,
  TranslationNode,
  FillMaskNode,
  QuestionAnsweringNode,
  TableQuestionAnsweringNode,
  FeatureExtractionNode,
  TextClassificationNode,
  TokenClassificationNode,
  ZeroShotClassificationNode
];
