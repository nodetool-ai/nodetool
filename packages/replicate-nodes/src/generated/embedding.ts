import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class AllMPNetBaseV2 extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.AllMPNetBaseV2";
  static readonly title = "All M P Net Base V2";
  static readonly description = `This is a language model that can be used to obtain document embeddings suitable for downstream tasks like semantic search and clustering.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", description: "A single string to encode." })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    description: "A JSON-formatted list of strings to encode."
  })
  declare text_batch: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const text = String(this.text ?? "");
    const textBatch = String(this.text_batch ?? "");

    const args: Record<string, unknown> = {
      text: text,
      text_batch: textBatch
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "replicate/all-mpnet-base-v2:b6b7585c9640cd7a9572c6e129c9549d79c9c31f0d3fdce7baac7c67ca38f305",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class SnowflakeArcticEmbedL extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.SnowflakeArcticEmbedL";
  static readonly title = "Snowflake Arctic Embed L";
  static readonly description = `snowflake-arctic-embed is a suite of text embedding models that focuses on creating high-quality retrieval models optimized for performance
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "Snowflake is the Data Cloud!",
    description: "Prompt to generate a vector embedding for"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "Snowflake is the Data Cloud!");

    const args: Record<string, unknown> = {
      prompt: prompt
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/snowflake-arctic-embed-l:38f2c666dd6a9f96c50eca69bbb0029ed03cba002a289983dc0b487a93cfb1b4",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class NomicEmbedTextV1 extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.NomicEmbedTextV1";
  static readonly title = "Nomic Embed Text V1";
  static readonly description = `nomic-embed-text-v1 is 8192 context length text encoder that surpasses OpenAI text-embedding-ada-002 and text-embedding-3-small performance on short and long context tasks
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Input Sentence list - Each sentence should be split by a newline"
  })
  declare sentences: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const sentences = String(this.sentences ?? "");

    const args: Record<string, unknown> = {
      sentences: sentences
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/nomic-embed-text-v1:9f7155ca8f3a5596300cac0801815fa5a930a9b5339725fd085ac6f81598b7ed",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class BGE_Large_EN_V1_5 extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.BGE_Large_EN_V1_5";
  static readonly title = "B G E_ Large_ E N_ V1_5";
  static readonly description = `BAAI's bge-en-large-v1.5 for embedding text sequences
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 32,
    description: "Batch size to use when processing text data."
  })
  declare batch_size: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "When true, return output as npy file. By default, we return JSON"
  })
  declare convert_to_numpy: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to normalize embeddings."
  })
  declare normalize_embeddings: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Path to file containing text as JSONL with 'text' field or valid JSON string list."
  })
  declare path: any;

  @prop({
    type: "str",
    default: "",
    description:
      'text to embed, formatted as JSON list of strings (e.g. ["hello", "world"])'
  })
  declare texts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchSize = Number(this.batch_size ?? 32);
    const convertToNumpy = Boolean(this.convert_to_numpy ?? false);
    const normalizeEmbeddings = Boolean(this.normalize_embeddings ?? true);
    const texts = String(this.texts ?? "");

    const args: Record<string, unknown> = {
      batch_size: batchSize,
      convert_to_numpy: convertToNumpy,
      normalize_embeddings: normalizeEmbeddings,
      texts: texts
    };

    const pathRef = this.path as Record<string, unknown> | undefined;
    if (isRefSet(pathRef)) {
      const pathUrl = await assetToUrl(pathRef!, apiKey);
      if (pathUrl) args["path"] = pathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "nateraw/bge-large-en-v1.5:9cf9f015a9cb9c61d1a2610659cdac4a4ca222f2d3707a68517b18c198a9add1",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Granite_Embedding_278M extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.Granite_Embedding_278M";
  static readonly title = "Granite_ Embedding_278 M";
  static readonly description = `Granite-Embedding-278M-Multilingual is a 278M parameter model from the Granite Embeddings suite that can be used to generate high quality text embeddings
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    description: "A list of texts to embed."
  })
  declare texts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const texts = String(this.texts ?? []);

    const args: Record<string, unknown> = {
      texts: texts
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "ibm-granite/granite-embedding-278m-multilingual:1f76d42a05f120e12272746d5a2d86b525c13420773f795a4cbef9117d8685f1",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Multilingual_E5_Large extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.Multilingual_E5_Large";
  static readonly title = "Multilingual_ E5_ Large";
  static readonly description = `multilingual-e5-large: A multi-language text embedding model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 32,
    description: "Batch size to use when processing text data."
  })
  declare batch_size: any;

  @prop({
    type: "bool",
    default: true,
    description: "Whether to normalize embeddings."
  })
  declare normalize_embeddings: any;

  @prop({
    type: "str",
    default:
      '["In the water, fish are swimming.", "Fish swim in the water.", "A book lies open on the table."]',
    description:
      'text to embed, formatted as JSON list of strings (e.g. ["hello", "world"])'
  })
  declare texts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchSize = Number(this.batch_size ?? 32);
    const normalizeEmbeddings = Boolean(this.normalize_embeddings ?? true);
    const texts = String(
      this.texts ??
        '["In the water, fish are swimming.", "Fish swim in the water.", "A book lies open on the table."]'
    );

    const args: Record<string, unknown> = {
      batch_size: batchSize,
      normalize_embeddings: normalizeEmbeddings,
      texts: texts
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "beautyyuyanli/multilingual-e5-large:a06276a89f1a902d5fc225a9ca32b6e8e6292b7f3b136518878da97c458e2bad",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Jina_CLIP_V2 extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.Jina_CLIP_V2";
  static readonly title = "Jina_ C L I P_ V2";
  static readonly description = `Jina-CLIP v2: 0.9B multimodal embedding model with 89-language multilingual support, 512x512 image resolution, and Matryoshka representations
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "int",
    default: 64,
    description: "Matryoshka dimension - output embedding dimension (64-1024)"
  })
  declare embedding_dim: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image file to embed (optimal size: 512x512). If both text and image provided, image embedding will be second in returned list."
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "base64",
    values: ["base64", "array"],
    description: "Format to use in outputs"
  })
  declare output_format: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Text content to embed (up to 8192 tokens). If both text and image provided, text embedding will be first in returned list."
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const embeddingDim = Number(this.embedding_dim ?? 64);
    const outputFormat = String(this.output_format ?? "base64");
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      embedding_dim: embeddingDim,
      output_format: outputFormat,
      text: text
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "zsxkib/jina-clip-v2:5050c3108bab23981802011a3c76ee327cc0dbfdd31a2f4ef1ee8ef0d3f0b448",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GTE_Qwen2_7B extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.GTE_Qwen2_7B";
  static readonly title = "G T E_ Qwen2_7 B";
  static readonly description = `Embed text with Qwen2-7b-Instruct
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "list[str]", default: [], description: "Texts to embed" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const text = String(this.text ?? []);

    const args: Record<string, unknown> = {
      text: text
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cuuupid/gte-qwen2-7b-instruct:67b1736bae9312a321217b2e10547882943b9e4a285eac4cba4043fab954b954",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class E5_Mistral_7B extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.E5_Mistral_7B";
  static readonly title = "E5_ Mistral_7 B";
  static readonly description = `E5-mistral-7b-instruct language embedding model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", description: "The document to be used." })
  declare document: any;

  @prop({
    type: "bool",
    default: false,
    description: "Whether to output the normalized embeddings or not."
  })
  declare normalize: any;

  @prop({ type: "str", default: "", description: "The query to be used." })
  declare query: any;

  @prop({ type: "str", default: "", description: "The task description." })
  declare task: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const document = String(this.document ?? "");
    const normalize = Boolean(this.normalize ?? false);
    const query = String(this.query ?? "");
    const task = String(this.task ?? "");

    const args: Record<string, unknown> = {
      document: document,
      normalize: normalize,
      query: query,
      task: task
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "adirik/e5-mistral-7b-instruct:68a9e0387243c2aa73d8e1aa81303f9859e6e4365622a832f7a582722e5d3283",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class CLIP_Features extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.CLIP_Features";
  static readonly title = "C L I P_ Features";
  static readonly description = `Return CLIP features for the clip-vit-large-patch14 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "a\nb",
    description:
      "Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]://"
  })
  declare inputs: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const field_inputs = String(this.inputs ?? "a\nb");

    const args: Record<string, unknown> = {
      inputs: field_inputs
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class ImageBind extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.ImageBind";
  static readonly title = "Image Bind";
  static readonly description = `A model for text, audio, and image embeddings in one space
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "file that you want to embed. Needs to be text, vision, or audio."
  })
  declare input: any;

  @prop({
    type: "enum",
    default: "vision",
    values: ["text", "vision", "audio"],
    description: "modality of the input you'd like to embed"
  })
  declare modality: any;

  @prop({
    type: "str",
    default: "",
    description:
      "text that you want to embed. Provide a string here instead of a text file to input if you'd like."
  })
  declare text_input: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const modality = String(this.modality ?? "vision");
    const textInput = String(this.text_input ?? "");

    const args: Record<string, unknown> = {
      modality: modality,
      text_input: textInput
    };

    const inputRef = this.input as Record<string, unknown> | undefined;
    if (isRefSet(inputRef)) {
      const inputUrl = await assetToUrl(inputRef!, apiKey);
      if (inputUrl) args["input"] = inputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class CLIP_Embeddings extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.CLIP_Embeddings";
  static readonly title = "C L I P_ Embeddings";
  static readonly description = `Generate CLIP (clip-vit-large-patch14) text & image embeddings
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Input text" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      text: text
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GTE_Base extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.GTE_Base";
  static readonly title = "G T E_ Base";
  static readonly description = `General Text Embeddings (GTE) model.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", description: "Text string to embed" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const text = String(this.text ?? "");

    const args: Record<string, unknown> = {
      text: text
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "mark3labs/embeddings-gte-base:d619cff29338b9a37c3d06605042e1ff0594a8c3eff0175fd6967f5643fc4d47",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llama2_13B_Embeddings extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.Llama2_13B_Embeddings";
  static readonly title = "Llama2_13 B_ Embeddings";
  static readonly description = `Llama2 13B with embedding output
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "\n\n",
    description: "Separator between prompts"
  })
  declare prompt_separator: any;

  @prop({
    type: "str",
    default: "",
    description:
      "List of prompts, separated by prompt_separator. Maximum 100 prompts per prediction."
  })
  declare prompts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const promptSeparator = String(this.prompt_separator ?? "\n\n");
    const prompts = String(this.prompts ?? "");

    const args: Record<string, unknown> = {
      prompt_separator: promptSeparator,
      prompts: prompts
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "andreasjansson/llama-2-13b-embeddings:7115a4c65b86815e31412e53de1211c520164c190945a84c425b59dccbc47148",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class BGE_1_5_Query extends ReplicateNode {
  static readonly nodeType = "replicate.embedding.BGE_1_5_Query";
  static readonly title = "B G E_1_5_ Query";
  static readonly description = `Query embedding generator for BAAI's bge-large-en v1.5 embedding model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 200,
    description:
      "You probably don't need to worry about this parameter if you're just getting the embeddings for a handful of queries. This parameter sets the maximumum number of kibiTokens (1 kibiToken = 1024 tokens) to try to stuff into a batch (to avoid out of memory errors but maximize throughput). If the total number of tokens across the flattened list of requested embeddings exceed this value, the list will be split internally and run across multiple forward passes. This will not affect the shape of your output, just the time it takes to run."
  })
  declare batchtoken_max: any;

  @prop({
    type: "bool",
    default: true,
    description:
      "normalizes returned embedding vectors to a magnitude of 1. (default: true, as this model presumes cosine similarity comparisons downstream)"
  })
  declare normalize: any;

  @prop({
    type: "enum",
    default: "full",
    values: ["full", "half"],
    description:
      "numerical precision for inference computations. Either full or half. Defaults to a paranoid value of full. You may want to test if 'half' is sufficient for your needs, though regardless you should probably prefer to use the same precision for querying as you do for archiving."
  })
  declare precision: any;

  @prop({
    type: "str",
    default: "[]",
    description:
      "A serialized JSON array of strings you wish to generate *retreival* embeddings for. (note, that you should keep this list short to avoid Replicate response size limitations). Use this to embed short text queries intended for comparison against document text. A vector will be returned corresponding to each line of text in the input array (in order of input). This endpoint will automatically format your query strings for retrieval, you do not need to preprocess them."
  })
  declare query_texts: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const batchtokenMax = Number(this.batchtoken_max ?? 200);
    const normalize = Boolean(this.normalize ?? true);
    const precision = String(this.precision ?? "full");
    const queryTexts = String(this.query_texts ?? "[]");

    const args: Record<string, unknown> = {
      batchtoken_max: batchtokenMax,
      normalize: normalize,
      precision: precision,
      query_texts: queryTexts
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "center-for-curriculum-redesign/bge_1-5_query_embeddings:438621acdb4511d2d9c6296860588ee6c60c3df63c93e2012297db8bb965732d",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_EMBEDDING_NODES: readonly NodeClass[] = [
  AllMPNetBaseV2,
  SnowflakeArcticEmbedL,
  NomicEmbedTextV1,
  BGE_Large_EN_V1_5,
  Granite_Embedding_278M,
  Multilingual_E5_Large,
  Jina_CLIP_V2,
  GTE_Qwen2_7B,
  E5_Mistral_7B,
  CLIP_Features,
  ImageBind,
  CLIP_Embeddings,
  GTE_Base,
  Llama2_13B_Embeddings,
  BGE_1_5_Query
] as const;
