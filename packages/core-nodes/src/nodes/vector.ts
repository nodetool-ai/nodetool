/**
 * Vector database nodes for NodeTool.
 * Provides collection management, indexing, and querying operations against
 * the active VectorProvider (sqlite-vec by default).
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";
import {
  getDefaultVectorProvider,
  OllamaEmbeddingFunction,
  type RecordMetadata,
  type VectorCollection,
  type VectorMatch,
  type VectorRecord
} from "@nodetool-ai/vectorstore";

async function getCollectionByName(name: string): Promise<VectorCollection> {
  return getDefaultVectorProvider().getCollection({ name });
}

function flattenMetadata(obj: Record<string, unknown>): RecordMetadata {
  const result: RecordMetadata = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      result[k] = v;
    } else if (v !== null && v !== undefined) {
      result[k] = String(v);
    }
  }
  return result;
}

/** Sort matches by id ascending — mirrors the legacy Python ordering. */
function sortMatchesById(matches: VectorMatch[]): VectorMatch[] {
  return [...matches].sort((a, b) => a.id.localeCompare(b.id));
}

function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Length of the longest word suffix of `words1` that prefixes `words2`. */
function findWordOverlap(
  words1: string[],
  words2: string[],
  minOverlap: number
): number {
  if (words1.length < minOverlap || words2.length < minOverlap) return 0;

  const maxCheck = Math.min(words1.length, words2.length);
  for (let overlapSize = maxCheck; overlapSize >= minOverlap; overlapSize--) {
    const tail = words1.slice(words1.length - overlapSize);
    const head = words2.slice(0, overlapSize);
    if (tail.every((w, i) => w === head[i])) {
      return overlapSize;
    }
  }
  return 0;
}

/** Build a $document keyword filter for the query text, or null if no tokens. */
function keywordFilter(
  text: string,
  minKeywordLength: number
): Record<string, unknown> | null {
  const pattern = /[ ,.!?\-_=|]+/;
  const queryTokens = text
    .toLowerCase()
    .split(pattern)
    .map((t) => t.trim())
    .filter((t) => t.length >= minKeywordLength);

  if (queryTokens.length === 0) return null;
  if (queryTokens.length > 1) {
    return {
      $document: {
        $or: queryTokens.map((token) => ({ $contains: token }))
      }
    };
  }
  return { $document: { $contains: queryTokens[0] } };
}

export class CollectionNode extends BaseNode {
  static readonly nodeType = "vector.Collection";
  static readonly title = "Collection";
  static readonly description =
    "Get or create a named vector database collection for storing embeddings.\n    vector, embedding, collection, RAG, get, create";
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["embedding_model"];
  static readonly metadataOutputTypes = {
    output: "collection"
  };

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The name of the collection to create"
  })
  declare name: string;

  @prop({
    type: "llama_model",
    default: {
      type: "llama_model",
      name: "",
      repo_id: "",
      modified_at: "",
      size: 0,
      digest: "",
      details: {}
    },
    title: "Embedding Model",
    description:
      "Model to use for embedding, search for nomic-embed-text and download it"
  })
  declare embedding_model: unknown;

  async process(): Promise<Record<string, unknown>> {
    const name = String(this.name ?? "");
    const embeddingModel = (this.embedding_model ?? { repo_id: "" }) as {
      repo_id: string;
    };

    if (!name.trim()) {
      throw new Error("Collection name cannot be empty");
    }

    const provider = getDefaultVectorProvider();
    await provider.getOrCreateCollection({
      name,
      metadata: { embedding_model: embeddingModel.repo_id ?? "" }
    });

    return { output: { type: "collection", name } };
  }
}

export class CountNode extends BaseNode {
  static readonly nodeType = "vector.Count";
  static readonly title = "Count Documents";
  static readonly description =
    "Count the number of documents in a collection.\n    vector, embedding, collection, RAG";
  static readonly inlineFields = [];
  static readonly inputFields = ["collection"];
  static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to count"
  })
  declare collection: unknown;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const collection = await getCollectionByName(name);
    const count = await collection.count();
    return { output: count };
  }
}

export class GetDocumentsNode extends BaseNode {
  static readonly nodeType = "vector.GetDocuments";
  static readonly title = "Get Documents";
  static readonly description =
    "Get documents from a collection.\n    vector, embedding, collection, RAG, retrieve";
  static readonly inlineFields = ["limit", "offset"];
  static readonly inputFields = ["collection", "ids"];
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to get"
  })
  declare collection: unknown;

  @prop({
    type: "list[str]",
    default: [],
    title: "Ids",
    description: "The ids of the documents to get"
  })
  declare ids: string[];

  @prop({
    type: "int",
    default: 100,
    title: "Limit",
    description: "The limit of the documents to get"
  })
  declare limit: number;

  @prop({
    type: "int",
    default: 0,
    title: "Offset",
    description: "The offset of the documents to get"
  })
  declare offset: number;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const ids = (this.ids ?? []) as string[];
    const limit = Number(this.limit ?? 100);
    const offset = Number(this.offset ?? 0);

    const collection = await getCollectionByName(name);
    // Empty ids means "no id filter": return all documents honoring
    // limit/offset (the provider treats a missing ids option as unfiltered).
    const records = await collection.get({
      ids: ids.length > 0 ? ids : undefined,
      limit,
      offset
    });

    return { output: records.map((r: VectorRecord) => r.document ?? null) };
  }
}

export class PeekNode extends BaseNode {
  static readonly nodeType = "vector.Peek";
  static readonly title = "Peek";
  static readonly description =
    "Peek at the documents in a collection.\n    vector, embedding, collection, RAG, preview";
  static readonly inlineFields = ["limit"];
  static readonly inputFields = ["collection"];
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to peek"
  })
  declare collection: unknown;

  @prop({
    type: "int",
    default: 100,
    title: "Limit",
    description: "The limit of the documents to peek"
  })
  declare limit: number;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const limit = Number(this.limit ?? 100);

    const collection = await getCollectionByName(name);
    const records = await collection.get({ limit });
    return { output: records.map((r: VectorRecord) => r.document ?? null) };
  }
}

export class IndexImageNode extends BaseNode {
  static readonly nodeType = "vector.IndexImage";
  static readonly title = "Index Image";
  static readonly description =
    "Index a list of image assets or files.\n    vector, embedding, collection, RAG, index, image, batch";
  static readonly inlineFields = ["index_id", "upsert"];
  static readonly inputFields = ["collection", "image", "metadata"];

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: unknown;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image asset to index"
  })
  declare image: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Index Id",
    description:
      "The ID to associate with the image, defaults to the URI of the image"
  })
  declare index_id: string;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the image"
  })
  declare metadata: Record<string, unknown>;

  @prop({
    type: "bool",
    default: false,
    title: "Upsert",
    description: "Whether to upsert the images"
  })
  declare upsert: boolean;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const image = (this.image ?? {}) as Record<string, unknown>;
    const indexId = String(this.index_id ?? "");
    const metadataRaw = (this.metadata ?? {}) as Record<string, unknown>;

    const resolvedId =
      indexId.trim() ||
      String((image as Record<string, unknown>).document_id ?? "").trim();

    if (!resolvedId) {
      throw new Error(
        "document_id cannot be empty for image. Provide index_id or ensure image has a document_id."
      );
    }

    const uri = String(image.uri ?? image.asset_id ?? "");
    if (!uri) {
      throw new Error("Image reference must have a uri or asset_id");
    }

    const collection = await getCollectionByName(name);
    await collection.upsert([
      {
        id: resolvedId,
        uri,
        metadata: flattenMetadata(metadataRaw)
      }
    ]);

    return { output: null };
  }
}

export class IndexEmbeddingNode extends BaseNode {
  static readonly nodeType = "vector.IndexEmbedding";
  static readonly title = "Index Embedding";
  static readonly description =
    "Index a single embedding vector into a collection with optional metadata. Creates a searchable entry that can be queried for similarity matching.\n    vector, index, embedding, storage, RAG";
  static readonly inlineFields = ["index_id"];
  static readonly inputFields = ["collection", "embedding", "metadata"];

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: unknown;

  @prop({
    type: "list",
    default: { type: "list", value: null, dtype: "<i8", shape: [1] },
    title: "Embedding",
    description: "The embedding to index"
  })
  declare embedding: unknown;

  @prop({
    type: "union[str, list[str]]",
    default: "",
    title: "Index Id",
    description: "The ID to associate with the embedding"
  })
  declare index_id: string | string[];

  @prop({
    type: "union[dict, list[dict]]",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the embedding"
  })
  declare metadata: Record<string, unknown> | Record<string, unknown>[];

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const embeddingRaw = this.embedding;
    const indexId = this.index_id ?? "";
    const metadataRaw = this.metadata ?? {};

    let embeddings: number[][];
    if (Array.isArray(embeddingRaw)) {
      if (embeddingRaw.length === 0)
        throw new Error("The embedding cannot be empty");
      if (typeof embeddingRaw[0] === "number") {
        embeddings = [embeddingRaw as number[]];
      } else {
        embeddings = embeddingRaw as number[][];
      }
    } else if (embeddingRaw && typeof embeddingRaw === "object") {
      const obj = embeddingRaw as Record<string, unknown>;
      const data = obj.data ?? obj.array ?? obj.embedding ?? obj.value;
      if (Array.isArray(data)) {
        if (typeof data[0] === "number") {
          embeddings = [data as number[]];
        } else {
          embeddings = data as number[][];
        }
      } else {
        throw new Error("Cannot extract embedding data from provided object");
      }
    } else {
      throw new Error("The embedding cannot be empty");
    }

    const collection = await getCollectionByName(name);

    if (Array.isArray(indexId)) {
      if (indexId.length === 0) throw new Error("The IDs list cannot be empty");
      if (indexId.length !== embeddings.length) {
        throw new Error(
          `Number of IDs (${indexId.length}) must match number of embeddings (${embeddings.length})`
        );
      }

      let metadatas: RecordMetadata[];
      if (Array.isArray(metadataRaw)) {
        if (metadataRaw.length !== indexId.length) {
          throw new Error(
            `Number of IDs (${indexId.length}) must match number of metadatas (${metadataRaw.length})`
          );
        }
        metadatas = metadataRaw.map(flattenMetadata);
      } else {
        const flat = flattenMetadata(metadataRaw as Record<string, unknown>);
        metadatas = Array(indexId.length).fill(flat) as RecordMetadata[];
      }

      await collection.upsert(
        indexId.map((id: string, i: number) => ({
          id,
          embedding: embeddings[i],
          metadata: metadatas[i]
        }))
      );
    } else {
      const idStr = String(indexId);
      if (!idStr.trim()) throw new Error("The ID cannot be empty");

      const flat = flattenMetadata(
        (Array.isArray(metadataRaw) ? metadataRaw[0] : metadataRaw) as Record<
          string,
          unknown
        >
      );

      await collection.upsert([
        { id: idStr, embedding: embeddings[0], metadata: flat }
      ]);
    }

    return { output: null };
  }
}

export class IndexTextChunkNode extends BaseNode {
  static readonly nodeType = "vector.IndexTextChunk";
  static readonly title = "Index Text Chunk";
  static readonly description =
    "Index a single text chunk.\n    vector, embedding, collection, RAG, index, text, chunk";
  static readonly inlineFields = ["document_id", "text"];
  static readonly inputFields = ["collection", "metadata"];

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "The document ID to associate with the text chunk"
  })
  declare document_id: string;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to index"
  })
  declare text: string;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text chunk"
  })
  declare metadata: Record<string, unknown>;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const documentId = String(this.document_id ?? "");
    if (!documentId.trim()) throw new Error("The document ID cannot be empty");

    const text = String(this.text ?? "");
    const metadataRaw = (this.metadata ?? {}) as Record<string, unknown>;

    const collection = await getCollectionByName(name);
    await collection.upsert([
      { id: documentId, document: text, metadata: flattenMetadata(metadataRaw) }
    ]);

    return { output: null };
  }
}

type AggregationMethod = "mean" | "max" | "min" | "sum";

export class IndexAggregatedTextNode extends BaseNode {
  static readonly nodeType = "vector.IndexAggregatedText";
  static readonly title = "Index Aggregated Text";
  static readonly description =
    "Index multiple text chunks at once with aggregated embeddings from Ollama.\n    vector, embedding, collection, RAG, index, text, chunk, batch, ollama";
  static readonly inlineFields = ["document", "document_id"];
  static readonly inputFields = ["collection", "metadata", "text_chunks"];

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Document",
    description: "The document to index"
  })
  declare document: string;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "The document ID to associate with the text"
  })
  declare document_id: string;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text"
  })
  declare metadata: Record<string, unknown>;

  @prop({
    type: "list[union[text_chunk, str]]",
    default: [],
    title: "Text Chunks",
    description: "List of text chunks to index"
  })
  declare text_chunks: unknown[];

  @prop({
    type: "enum",
    default: "mean",
    title: "Aggregation",
    description: "The aggregation method to use for the embeddings.",
    values: ["mean", "max", "min", "sum"]
  })
  declare aggregation: string;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const document = String(this.document ?? "");
    const documentId = String(this.document_id ?? "");
    const metadataRaw = (this.metadata ?? {}) as Record<string, unknown>;
    const textChunksRaw = (this.text_chunks ?? []) as (
      | string
      | { text: string }
    )[];
    const aggregation = String(this.aggregation ?? "mean") as AggregationMethod;

    if (!documentId.trim()) throw new Error("The document ID cannot be empty");
    if (!document.trim()) throw new Error("The document cannot be empty");
    if (textChunksRaw.length === 0)
      throw new Error("The text chunks cannot be empty");

    const collection = await getCollectionByName(name);
    const model = (collection.metadata as Record<string, unknown> | undefined)
      ?.embedding_model as string | undefined;
    if (!model)
      throw new Error(
        "The collection does not have an embedding_model in its metadata"
      );

    const texts = textChunksRaw.map((chunk) =>
      typeof chunk === "string" ? chunk : chunk.text
    );

    // Embed all chunks in one batched call against a single Ollama instance.
    const embeddingFn = new OllamaEmbeddingFunction(model);
    const embeddings = await embeddingFn.generate(texts);

    const dim = embeddings[0].length;
    const aggregated = new Array<number>(dim).fill(0);

    if (aggregation === "mean" || aggregation === "sum") {
      for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) aggregated[i] += emb[i];
      }
      if (aggregation === "mean") {
        for (let i = 0; i < dim; i++) aggregated[i] /= embeddings.length;
      }
    } else if (aggregation === "max") {
      for (let i = 0; i < dim; i++) aggregated[i] = embeddings[0][i];
      for (let j = 1; j < embeddings.length; j++) {
        for (let i = 0; i < dim; i++) {
          aggregated[i] = Math.max(aggregated[i], embeddings[j][i]);
        }
      }
    } else if (aggregation === "min") {
      for (let i = 0; i < dim; i++) aggregated[i] = embeddings[0][i];
      for (let j = 1; j < embeddings.length; j++) {
        for (let i = 0; i < dim; i++) {
          aggregated[i] = Math.min(aggregated[i], embeddings[j][i]);
        }
      }
    } else {
      throw new Error(`Invalid aggregation method: ${aggregation}`);
    }

    const flat = flattenMetadata(metadataRaw);

    await collection.upsert([
      {
        id: documentId,
        document,
        embedding: aggregated,
        metadata: Object.keys(flat).length > 0 ? flat : undefined
      }
    ]);

    return { output: null };
  }
}

export class IndexStringNode extends BaseNode {
  static readonly nodeType = "vector.IndexString";
  static readonly title = "Index String";
  static readonly description =
    "Index a string with a Document ID to a collection.\n    vector, embedding, collection, RAG, index, text, string";
  static readonly inlineFields = ["text", "document_id"];
  static readonly inputFields = ["collection", "metadata"];

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text content to index"
  })
  declare text: string;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "Document ID to associate with the text content"
  })
  declare document_id: string;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text"
  })
  declare metadata: Record<string, unknown>;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const documentId = String(this.document_id ?? "");
    if (!documentId.trim()) throw new Error("The document ID cannot be empty");

    const text = String(this.text ?? "");

    const collection = await getCollectionByName(name);
    await collection.upsert([{ id: documentId, document: text }]);

    return { output: null };
  }
}

export class QueryImageNode extends BaseNode {
  static readonly nodeType = "vector.QueryImage";
  static readonly title = "Query Image";
  static readonly description =
    "Query the index for similar images.\n    vector, RAG, query, image, search, similarity";
  static readonly inlineFields = ["n_results"];
  static readonly inputFields = ["collection", "image"];
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]"
  };

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: unknown;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to query"
  })
  declare image: unknown;

  @prop({
    type: "int",
    default: 1,
    title: "N Results",
    description: "The number of results to return"
  })
  declare n_results: number;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const image = (this.image ?? {}) as Record<string, unknown>;
    const uri = String(image.uri ?? image.asset_id ?? "");
    if (!uri) throw new Error("Image is not connected (no uri or asset_id)");

    const nResults = Number(this.n_results ?? 1);

    const collection = await getCollectionByName(name);
    const matches = sortMatchesById(
      await collection.query({ uri, topK: nResults })
    );

    return {
      ids: matches.map((m) => m.id),
      documents: matches.map((m) => m.document ?? ""),
      metadatas: matches.map((m) => m.metadata),
      distances: matches.map((m) => m.distance)
    };
  }
}

export class QueryTextNode extends BaseNode {
  static readonly nodeType = "vector.QueryText";
  static readonly title = "Query Text";
  static readonly description =
    "Query the index for similar text.\n    vector, RAG, query, text, search, similarity";
  static readonly inlineFields = ["text", "n_results"];
  static readonly inputFields = ["collection"];
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]"
  };

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to query"
  })
  declare text: string;

  @prop({
    type: "int",
    default: 1,
    title: "N Results",
    description: "The number of results to return"
  })
  declare n_results: number;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const text = String(this.text ?? "");
    const nResults = Number(this.n_results ?? 1);

    const collection = await getCollectionByName(name);
    const matches = sortMatchesById(
      await collection.query({ text, topK: nResults })
    );

    return {
      ids: matches.map((m) => m.id),
      documents: matches.map((m) => m.document ?? ""),
      metadatas: matches.map((m) => m.metadata),
      distances: matches.map((m) => m.distance)
    };
  }
}

export class RemoveOverlapNode extends BaseNode {
  static readonly nodeType = "vector.RemoveOverlap";
  static readonly title = "Remove Overlap";
  static readonly description =
    "Removes overlapping words between consecutive strings in a list. Splits text into words and matches word sequences for more accurate overlap detection.\n    vector, RAG, query, text, processing, overlap, deduplication";
  static readonly inlineFields = ["min_overlap_words"];
  static readonly inputFields = ["documents"];
  static readonly metadataOutputTypes = {
    documents: "list[str]"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Documents",
    description: "List of strings to process for overlap removal"
  })
  declare documents: string[];

  @prop({
    type: "int",
    default: 2,
    title: "Min Overlap Words",
    description: "Minimum number of words that must overlap to be considered"
  })
  declare min_overlap_words: number;

  async process(): Promise<Record<string, unknown>> {
    const documents = (this.documents ?? []) as string[];
    const minOverlapWords = Number(this.min_overlap_words ?? 2);

    if (documents.length === 0) {
      return { documents: [] };
    }

    const result: string[] = [documents[0]];

    for (let i = 1; i < documents.length; i++) {
      const prevWords = splitIntoWords(result[result.length - 1]);
      const currWords = splitIntoWords(documents[i]);

      const overlapWordCount = findWordOverlap(
        prevWords,
        currWords,
        minOverlapWords
      );

      if (overlapWordCount > 0) {
        const newText = currWords.slice(overlapWordCount).join(" ");
        if (newText) result.push(newText);
      } else {
        result.push(documents[i]);
      }
    }

    return { documents: result };
  }
}

export class HybridSearchNode extends BaseNode {
  static readonly nodeType = "vector.HybridSearch";
  static readonly title = "Hybrid Search";
  static readonly description =
    "Fuse a semantic ranking with a keyword-filtered semantic ranking via reciprocal rank fusion. The keyword leg runs the same semantic query constrained to documents containing the query tokens, so documents matching on both legs rank higher.\n    vector, RAG, query, semantic, text, similarity";
  static readonly inlineFields = ["text", "n_results"];
  static readonly inputFields = ["collection"];
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]",
    scores: "list[float]"
  };

  @prop({
    type: "collection",
    default: { type: "collection", name: "" },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to query"
  })
  declare text: string;

  @prop({
    type: "int",
    default: 5,
    title: "N Results",
    description: "The number of final results to return"
  })
  declare n_results: number;

  @prop({
    type: "float",
    default: 60,
    title: "K Constant",
    description: "Constant for reciprocal rank fusion (default: 60.0)"
  })
  declare k_constant: number;

  @prop({
    type: "int",
    default: 3,
    title: "Min Keyword Length",
    description: "Minimum length for keyword tokens"
  })
  declare min_keyword_length: number;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ?? { name: "" }) as { name: string };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const text = String(this.text ?? "");
    if (!text.trim()) throw new Error("Search text cannot be empty");

    const nResults = Number(this.n_results ?? 5);
    const kConstant = Number(this.k_constant ?? 60.0);
    const minKeywordLength = Number(this.min_keyword_length ?? 3);

    const collection = await getCollectionByName(name);

    const semanticMatches = await collection.query({
      text,
      topK: nResults * 2
    });

    // Without a keyword filter there is no second ranking to fuse — fusing
    // the semantic list against itself would only double every score.
    const filter = keywordFilter(text, minKeywordLength);
    const keywordMatches: VectorMatch[] = filter
      ? await collection.query({
          text,
          topK: nResults * 2,
          filter
        })
      : [];

    const combinedScores = new Map<
      string,
      {
        doc: string;
        meta: Record<string, unknown>;
        distance: number;
        score: number;
      }
    >();

    const fuse = (matches: VectorMatch[]) => {
      matches.forEach((m, rank) => {
        const score = 1 / (rank + kConstant);
        const existing = combinedScores.get(m.id);
        if (existing) {
          existing.score += score;
        } else {
          combinedScores.set(m.id, {
            doc: m.document ?? "",
            meta: m.metadata,
            distance: m.distance,
            score
          });
        }
      });
    };

    fuse(semanticMatches);
    fuse(keywordMatches);

    const sorted = [...combinedScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, nResults);

    return {
      ids: sorted.map(([id]) => id),
      documents: sorted.map(([, d]) => d.doc),
      metadatas: sorted.map(([, d]) => d.meta),
      distances: sorted.map(([, d]) => d.distance),
      scores: sorted.map(([, d]) => d.score)
    };
  }
}

export const VECTOR_NODES = tagAsUniversal([
  CollectionNode,
  CountNode,
  GetDocumentsNode,
  PeekNode,
  IndexImageNode,
  IndexEmbeddingNode,
  IndexTextChunkNode,
  IndexAggregatedTextNode,
  IndexStringNode,
  QueryImageNode,
  QueryTextNode,
  RemoveOverlapNode,
  HybridSearchNode
]);
