// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Collection — vector.Collection
export type CollectionInputs = {
  name?: Connectable<string>;
  embedding_model?: Connectable<unknown>;
};

export interface CollectionOutputs {
  output: unknown;
}

export function collection(inputs: CollectionInputs, options?: NodeOptions): NodeWithOutputs<CollectionOutputs, "output"> {
  return createNode("vector.Collection", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"collection"}, defaultOutput: "output" });
}

// Count Documents — vector.Count
export type CountInputs = {
  collection?: Connectable<unknown>;
};

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs, options?: NodeOptions): NodeWithOutputs<CountOutputs, "output"> {
  return createNode("vector.Count", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"int"}, defaultOutput: "output" });
}

// Get Documents — vector.GetDocuments
export type GetDocumentsInputs = {
  collection?: Connectable<unknown>;
  ids?: Connectable<string[]>;
  limit?: Connectable<number>;
  offset?: Connectable<number>;
};

export interface GetDocumentsOutputs {
  output: string[];
}

export function getDocuments(inputs: GetDocumentsInputs, options?: NodeOptions): NodeWithOutputs<GetDocumentsOutputs, "output"> {
  return createNode("vector.GetDocuments", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[str]"}, defaultOutput: "output" });
}

// Peek — vector.Peek
export type PeekInputs = {
  collection?: Connectable<unknown>;
  limit?: Connectable<number>;
};

export interface PeekOutputs {
  output: string[];
}

export function peek(inputs: PeekInputs, options?: NodeOptions): NodeWithOutputs<PeekOutputs, "output"> {
  return createNode("vector.Peek", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[str]"}, defaultOutput: "output" });
}

// Index Image — vector.IndexImage
export type IndexImageInputs = {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  index_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  upsert?: Connectable<boolean>;
};

export interface IndexImageOutputs {
}

export function indexImage(inputs: IndexImageInputs, options?: NodeOptions): NodeWithOutputs<IndexImageOutputs> {
  return createNode("vector.IndexImage", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}

// Index Embedding — vector.IndexEmbedding
export type IndexEmbeddingInputs = {
  collection?: Connectable<unknown>;
  embedding?: Connectable<unknown[]>;
  index_id?: Connectable<string | string[]>;
  metadata?: Connectable<Record<string, unknown> | Record<string, unknown>[]>;
};

export interface IndexEmbeddingOutputs {
}

export function indexEmbedding(inputs: IndexEmbeddingInputs, options?: NodeOptions): NodeWithOutputs<IndexEmbeddingOutputs> {
  return createNode("vector.IndexEmbedding", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}

// Index Text Chunk — vector.IndexTextChunk
export type IndexTextChunkInputs = {
  collection?: Connectable<unknown>;
  document_id?: Connectable<string>;
  text?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
};

export interface IndexTextChunkOutputs {
}

export function indexTextChunk(inputs: IndexTextChunkInputs, options?: NodeOptions): NodeWithOutputs<IndexTextChunkOutputs> {
  return createNode("vector.IndexTextChunk", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}

// Index Aggregated Text — vector.IndexAggregatedText
export type IndexAggregatedTextInputs = {
  collection?: Connectable<unknown>;
  document?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  text_chunks?: Connectable<(unknown | string)[]>;
  aggregation?: Connectable<"mean" | "max" | "min" | "sum">;
};

export interface IndexAggregatedTextOutputs {
}

export function indexAggregatedText(inputs: IndexAggregatedTextInputs, options?: NodeOptions): NodeWithOutputs<IndexAggregatedTextOutputs> {
  return createNode("vector.IndexAggregatedText", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}

// Index String — vector.IndexString
export type IndexStringInputs = {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
};

export interface IndexStringOutputs {
}

export function indexString(inputs: IndexStringInputs, options?: NodeOptions): NodeWithOutputs<IndexStringOutputs> {
  return createNode("vector.IndexString", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}

// Query Image — vector.QueryImage
export type QueryImageInputs = {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  n_results?: Connectable<number>;
};

export interface QueryImageOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryImage(inputs: QueryImageInputs, options?: NodeOptions): NodeWithOutputs<QueryImageOutputs> {
  return createNode("vector.QueryImage", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances"], outputTypes: {"ids":"list[str]","documents":"list[str]","metadatas":"list[dict]","distances":"list[float]"} });
}

// Query Text — vector.QueryText
export type QueryTextInputs = {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  n_results?: Connectable<number>;
};

export interface QueryTextOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryText(inputs: QueryTextInputs, options?: NodeOptions): NodeWithOutputs<QueryTextOutputs> {
  return createNode("vector.QueryText", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances"], outputTypes: {"ids":"list[str]","documents":"list[str]","metadatas":"list[dict]","distances":"list[float]"} });
}

// Remove Overlap — vector.RemoveOverlap
export type RemoveOverlapInputs = {
  documents?: Connectable<string[]>;
  min_overlap_words?: Connectable<number>;
};

export interface RemoveOverlapOutputs {
  documents: string[];
}

export function removeOverlap(inputs: RemoveOverlapInputs, options?: NodeOptions): NodeWithOutputs<RemoveOverlapOutputs, "documents"> {
  return createNode("vector.RemoveOverlap", inputs, { id: options?.id, outputNames: ["documents"], outputTypes: {"documents":"list[str]"}, defaultOutput: "documents" });
}

// Hybrid Search — vector.HybridSearch
export type HybridSearchInputs = {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  n_results?: Connectable<number>;
  k_constant?: Connectable<number>;
  min_keyword_length?: Connectable<number>;
};

export interface HybridSearchOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
  scores: number[];
}

export function hybridSearch(inputs: HybridSearchInputs, options?: NodeOptions): NodeWithOutputs<HybridSearchOutputs> {
  return createNode("vector.HybridSearch", inputs, { id: options?.id, outputNames: ["ids", "documents", "metadatas", "distances", "scores"], outputTypes: {"ids":"list[str]","documents":"list[str]","metadatas":"list[dict]","distances":"list[float]","scores":"list[float]"} });
}
