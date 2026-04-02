import type { ModuleConfig } from "../types.js";

export const embeddingConfig: ModuleConfig = {
  configs: {
    "replicate/all-mpnet-base-v2": {
      className: "AllMPNetBaseV2",
      returnType: "str"
    },
    "lucataco/snowflake-arctic-embed-l": {
      className: "SnowflakeArcticEmbedL",
      returnType: "str"
    },
    "lucataco/nomic-embed-text-v1": {
      className: "NomicEmbedTextV1",
      returnType: "str"
    },
    "nateraw/bge-large-en-v1.5": {
      className: "BGE_Large_EN_V1_5",
      returnType: "str"
    },
    "ibm-granite/granite-embedding-278m-multilingual": {
      className: "Granite_Embedding_278M",
      returnType: "str"
    },
    "beautyyuyanli/multilingual-e5-large": {
      className: "Multilingual_E5_Large",
      returnType: "str"
    },
    "zsxkib/jina-clip-v2": {
      className: "Jina_CLIP_V2",
      returnType: "str"
    },
    "cuuupid/gte-qwen2-7b-instruct": {
      className: "GTE_Qwen2_7B",
      returnType: "str"
    },
    "adirik/e5-mistral-7b-instruct": {
      className: "E5_Mistral_7B",
      returnType: "str"
    },
    "andreasjansson/clip-features": {
      className: "CLIP_Features",
      returnType: "str"
    },
    "daanelson/imagebind": {
      className: "ImageBind",
      returnType: "str"
    },
    "krthr/clip-embeddings": {
      className: "CLIP_Embeddings",
      returnType: "str"
    },
    "mark3labs/embeddings-gte-base": {
      className: "GTE_Base",
      returnType: "str"
    },
    "andreasjansson/llama-2-13b-embeddings": {
      className: "Llama2_13B_Embeddings",
      returnType: "str"
    },
    "center-for-curriculum-redesign/bge_1-5_query_embeddings": {
      className: "BGE_1_5_Query",
      returnType: "str"
    }
  }
};
