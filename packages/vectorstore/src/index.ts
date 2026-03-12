// @nodetool/vectorstore — ChromaDB vector store integration

export {
  getChromaClient,
  getCollection,
  getAllCollections,
  splitDocument,
  type TextChunk,
} from "./chroma-client.js";

export {
  ProviderEmbeddingFunction,
  OpenAIEmbeddingFunction,
  OllamaEmbeddingFunction,
  GeminiEmbeddingFunction,
  MistralEmbeddingFunction,
  getProviderEmbeddingFunction,
  type EmbeddingProvider,
  type ProviderEmbeddingOptions,
} from "./embedding.js";
