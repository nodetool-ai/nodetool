/**
 * Vector database nodes for NodeTool (sqlite-vec backed).
 * Provides collection management, indexing, and querying operations.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getVecStore,
  getCollection,
  OllamaEmbeddingFunction
} from "@nodetool/vectorstore";

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

async function getOllamaEmbedding(
  model: string,
  text: string
): Promise<number[]> {
  const ef = new OllamaEmbeddingFunction(model);
  const result = await ef.generate([text]);
  return result[0];
}

// ---------------------------------------------------------------------------
// 1. CollectionNode
// ---------------------------------------------------------------------------

export class CollectionNode extends BaseNode {
  static readonly nodeType = "vector.Collection";
  static readonly title = "Collection";
  static readonly description =
    "Get or create a named vector database collection for storing embeddings.\n    vector, embedding, collection, RAG, get, create";
  static readonly metadataOutputTypes = {
    output: "collection"
  };

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The name of the collection to create"
  })
  declare name: any;

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
  declare embedding_model: any;

  async process(): Promise<Record<string, unknown>> {
    const name = String(this.name ?? this.name ?? "");
    const embeddingModel = (this.embedding_model ??
      this.embedding_model ?? { repo_id: "" }) as {
      repo_id: string;
    };

    if (!name.trim()) {
      throw new Error("Collection name cannot be empty");
    }

    const store = await getVecStore();
    await store.getOrCreateCollection({
      name,
      metadata: { embedding_model: embeddingModel.repo_id ?? "" }
    });

    return { output: { name } };
  }
}

// ---------------------------------------------------------------------------
// 2. CountNode
// ---------------------------------------------------------------------------

export class CountNode extends BaseNode {
  static readonly nodeType = "vector.Count";
  static readonly title = "Count";
  static readonly description =
    "Count the number of documents in a collection.\n    vector, embedding, collection, RAG";
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
  declare collection: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const collection = await getCollection(name);
    const count = await collection.count();
    return { output: count };
  }
}

// ---------------------------------------------------------------------------
// 3. GetDocumentsNode
// ---------------------------------------------------------------------------

export class GetDocumentsNode extends BaseNode {
  static readonly nodeType = "vector.GetDocuments";
  static readonly title = "Get Documents";
  static readonly description =
    "Get documents from a collection.\n    vector, embedding, collection, RAG, retrieve";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to get"
  })
  declare collection: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Ids",
    description: "The ids of the documents to get"
  })
  declare ids: any;

  @prop({
    type: "int",
    default: 100,
    title: "Limit",
    description: "The limit of the documents to get"
  })
  declare limit: any;

  @prop({
    type: "int",
    default: 0,
    title: "Offset",
    description: "The offset of the documents to get"
  })
  declare offset: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const ids = (this.ids ?? this.ids ?? []) as string[];
    const limit = Number(this.limit ?? this.limit ?? 100);
    const offset = Number(this.offset ?? this.offset ?? 0);

    const collection = await getCollection(name);
    const result = await collection.get({
      ids: ids.length > 0 ? ids : undefined,
      limit,
      offset
    });

    return { output: result.documents };
  }
}

// ---------------------------------------------------------------------------
// 4. PeekNode
// ---------------------------------------------------------------------------

export class PeekNode extends BaseNode {
  static readonly nodeType = "vector.Peek";
  static readonly title = "Peek";
  static readonly description =
    "Peek at the documents in a collection.\n    vector, embedding, collection, RAG, preview";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to peek"
  })
  declare collection: any;

  @prop({
    type: "int",
    default: 100,
    title: "Limit",
    description: "The limit of the documents to peek"
  })
  declare limit: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const limit = Number(this.limit ?? this.limit ?? 100);

    const collection = await getCollection(name);
    const result = await collection.peek({ limit });
    return { output: result.documents };
  }
}

// ---------------------------------------------------------------------------
// 5. IndexImageNode
// ---------------------------------------------------------------------------

export class IndexImageNode extends BaseNode {
  static readonly nodeType = "vector.IndexImage";
  static readonly title = "Index Image";
  static readonly description =
    "Index a list of image assets or files.\n    vector, embedding, collection, RAG, index, image, batch";

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: any;

  @prop({
    type: "image",
    default: [],
    title: "Image",
    description: "List of image assets to index"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Index Id",
    description:
      "The ID to associate with the image, defaults to the URI of the image"
  })
  declare index_id: any;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the image"
  })
  declare metadata: any;

  @prop({
    type: "bool",
    default: false,
    title: "Upsert",
    description: "Whether to upsert the images"
  })
  declare upsert: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const image = (this.image ?? this.image ?? {}) as Record<string, unknown>;
    const indexId = String(this.index_id ?? this.index_id ?? "");
    const metadataRaw = (this.metadata ?? this.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const doUpsert = Boolean(this.upsert ?? this.upsert ?? false);

    // Resolve document ID: prefer explicit index_id, then document_id field on image ref
    const resolvedId =
      indexId.trim() ||
      String((image as Record<string, unknown>).document_id ?? "").trim();

    if (!resolvedId) {
      throw new Error(
        "document_id cannot be empty for image. Provide index_id or ensure image has a document_id."
      );
    }

    // Obtain image URI — TS environment does not have PIL; pass uri as document
    const uri = String(image.uri ?? image.asset_id ?? "");
    if (!uri) {
      throw new Error("Image reference must have a uri or asset_id");
    }

    // Flatten metadata to Record<string, string | number | boolean>
    const metadata: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        metadata[k] = v;
      } else {
        metadata[k] = String(v);
      }
    }

    const collection = await getCollection(name);

    if (doUpsert) {
      await collection.upsert({
        ids: [resolvedId],
        uris: [uri],
        metadatas: [metadata]
      });
    } else {
      await collection.add({
        ids: [resolvedId],
        uris: [uri],
        metadatas: [metadata]
      });
    }

    return { output: null };
  }
}

// ---------------------------------------------------------------------------
// 6. IndexEmbeddingNode
// ---------------------------------------------------------------------------

export class IndexEmbeddingNode extends BaseNode {
  static readonly nodeType = "vector.IndexEmbedding";
  static readonly title = "Index Embedding";
  static readonly description =
    "Index a single embedding vector into a collection with optional metadata. Creates a searchable entry that can be queried for similarity matching.\n    vector, index, embedding, storage, RAG";

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: any;

  @prop({
    type: "np_array",
    default: {
      type: "np_array",
      value: null,
      dtype: "<i8",
      shape: [1]
    },
    title: "Embedding",
    description: "The embedding to index"
  })
  declare embedding: any;

  @prop({
    type: "union[str, list[str]]",
    default: "",
    title: "Index Id",
    description: "The ID to associate with the embedding"
  })
  declare index_id: any;

  @prop({
    type: "union[dict, list[dict]]",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the embedding"
  })
  declare metadata: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const embeddingRaw = this.embedding ?? this.embedding;
    const indexId = this.index_id ?? this.index_id ?? "";
    const metadataRaw = this.metadata ?? this.metadata ?? {};

    // embeddingRaw may be a flat number[] (single embedding) or number[][] (batch)
    // or an NPArray-like object with a `data` field
    let embeddings: number[][];
    if (Array.isArray(embeddingRaw)) {
      if (embeddingRaw.length === 0)
        throw new Error("The embedding cannot be empty");
      if (typeof embeddingRaw[0] === "number") {
        // single 1-D array
        embeddings = [embeddingRaw as number[]];
      } else {
        embeddings = embeddingRaw as number[][];
      }
    } else if (embeddingRaw && typeof embeddingRaw === "object") {
      // NPArray-like
      const obj = embeddingRaw as Record<string, unknown>;
      const data = obj.data ?? obj.array ?? obj.embedding;
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

    if (Array.isArray(indexId)) {
      // Batch mode
      if (indexId.length === 0) throw new Error("The IDs list cannot be empty");
      if (indexId.length !== embeddings.length) {
        throw new Error(
          `Number of IDs (${indexId.length}) must match number of embeddings (${embeddings.length})`
        );
      }

      let metadatas: Record<string, string | number | boolean>[];
      if (Array.isArray(metadataRaw)) {
        if (metadataRaw.length !== indexId.length) {
          throw new Error(
            `Number of IDs (${indexId.length}) must match number of metadatas (${metadataRaw.length})`
          );
        }
        metadatas = metadataRaw.map(flattenMetadata);
      } else {
        const flat = flattenMetadata(metadataRaw as Record<string, unknown>);
        metadatas = Array(indexId.length).fill(flat) as Record<
          string,
          string | number | boolean
        >[];
      }

      const collection = await getCollection(name);
      await collection.add({
        ids: indexId,
        embeddings,
        metadatas
      });
    } else {
      // Single mode
      const idStr = String(indexId);
      if (!idStr.trim()) throw new Error("The ID cannot be empty");

      const flat = flattenMetadata(
        (Array.isArray(metadataRaw) ? metadataRaw[0] : metadataRaw) as Record<
          string,
          unknown
        >
      );

      const collection = await getCollection(name);
      await collection.add({
        ids: [idStr],
        embeddings: [embeddings[0]],
        metadatas: [flat]
      });
    }

    return { output: null };
  }
}

function flattenMetadata(
  obj: Record<string, unknown>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      result[k] = v;
    } else if (v !== null && v !== undefined) {
      result[k] = String(v);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 7. IndexTextChunkNode
// ---------------------------------------------------------------------------

export class IndexTextChunkNode extends BaseNode {
  static readonly nodeType = "vector.IndexTextChunk";
  static readonly title = "Index Text Chunk";
  static readonly description =
    "Index a single text chunk.\n    vector, embedding, collection, RAG, index, text, chunk";

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: any;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "The document ID to associate with the text chunk"
  })
  declare document_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to index"
  })
  declare text: any;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text chunk"
  })
  declare metadata: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const documentId = String(this.document_id ?? this.document_id ?? "");
    if (!documentId.trim()) throw new Error("The document ID cannot be empty");

    const text = String(this.text ?? this.text ?? "");
    const metadataRaw = (this.metadata ?? this.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const collection = await getCollection(name);
    await collection.add({
      ids: [documentId],
      documents: [text],
      metadatas: [flattenMetadata(metadataRaw)]
    });

    return { output: null };
  }
}

// ---------------------------------------------------------------------------
// 8. IndexAggregatedTextNode
// ---------------------------------------------------------------------------

type AggregationMethod = "mean" | "max" | "min" | "sum";

export class IndexAggregatedTextNode extends BaseNode {
  static readonly nodeType = "vector.IndexAggregatedText";
  static readonly title = "Index Aggregated Text";
  static readonly description =
    "Index multiple text chunks at once with aggregated embeddings from Ollama.\n    vector, embedding, collection, RAG, index, text, chunk, batch, ollama";

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: any;

  @prop({
    type: "str",
    default: "",
    title: "Document",
    description: "The document to index"
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "The document ID to associate with the text"
  })
  declare document_id: any;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text"
  })
  declare metadata: any;

  @prop({
    type: "list[union[text_chunk, str]]",
    default: [],
    title: "Text Chunks",
    description: "List of text chunks to index"
  })
  declare text_chunks: any;

  @prop({
    type: "enum",
    default: "mean",
    title: "Aggregation",
    description: "The aggregation method to use for the embeddings.",
    values: ["mean", "max", "min", "sum"]
  })
  declare aggregation: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const document = String(this.document ?? this.document ?? "");
    const documentId = String(this.document_id ?? this.document_id ?? "");
    const metadataRaw = (this.metadata ?? this.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const textChunksRaw = (this.text_chunks ?? this.text_chunks ?? []) as (
      | string
      | { text: string }
    )[];
    const aggregation = String(
      this.aggregation ?? this.aggregation ?? "mean"
    ) as AggregationMethod;

    if (!documentId.trim()) throw new Error("The document ID cannot be empty");
    if (!document.trim()) throw new Error("The document cannot be empty");
    if (textChunksRaw.length === 0)
      throw new Error("The text chunks cannot be empty");

    // Retrieve the collection to get the embedding model name
    const collection = await getCollection(name);
    const model = (collection.metadata as Record<string, unknown> | undefined)
      ?.embedding_model as string | undefined;
    if (!model)
      throw new Error(
        "The collection does not have an embedding_model in its metadata"
      );

    // Extract plain text from each chunk
    const texts = textChunksRaw.map((chunk) =>
      typeof chunk === "string" ? chunk : chunk.text
    );

    // Compute embeddings via Ollama
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await getOllamaEmbedding(model, text);
      embeddings.push(embedding);
    }

    // Aggregate embeddings
    const dim = embeddings[0].length;
    const aggregated = new Array<number>(dim).fill(0);

    if (aggregation === "mean" || aggregation === "sum") {
      for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) {
          aggregated[i] += emb[i];
        }
      }
      if (aggregation === "mean") {
        for (let i = 0; i < dim; i++) {
          aggregated[i] /= embeddings.length;
        }
      }
    } else if (aggregation === "max") {
      for (let i = 0; i < dim; i++) {
        aggregated[i] = embeddings[0][i];
      }
      for (let j = 1; j < embeddings.length; j++) {
        for (let i = 0; i < dim; i++) {
          aggregated[i] = Math.max(aggregated[i], embeddings[j][i]);
        }
      }
    } else if (aggregation === "min") {
      for (let i = 0; i < dim; i++) {
        aggregated[i] = embeddings[0][i];
      }
      for (let j = 1; j < embeddings.length; j++) {
        for (let i = 0; i < dim; i++) {
          aggregated[i] = Math.min(aggregated[i], embeddings[j][i]);
        }
      }
    } else {
      throw new Error(`Invalid aggregation method: ${aggregation}`);
    }

    const flat = flattenMetadata(metadataRaw);

    await collection.add({
      ids: [documentId],
      documents: [document],
      embeddings: [aggregated],
      metadatas: Object.keys(flat).length > 0 ? [flat] : undefined
    });

    return { output: null };
  }
}

// ---------------------------------------------------------------------------
// 9. IndexStringNode
// ---------------------------------------------------------------------------

export class IndexStringNode extends BaseNode {
  static readonly nodeType = "vector.IndexString";
  static readonly title = "Index String";
  static readonly description =
    "Index a string with a Document ID to a collection.\n    vector, embedding, collection, RAG, index, text, string";

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to index"
  })
  declare collection: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text content to index"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Document Id",
    description: "Document ID to associate with the text content"
  })
  declare document_id: any;

  @prop({
    type: "dict",
    default: {},
    title: "Metadata",
    description: "The metadata to associate with the text"
  })
  declare metadata: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const documentId = String(this.document_id ?? this.document_id ?? "");
    if (!documentId.trim()) throw new Error("The document ID cannot be empty");

    const text = String(this.text ?? this.text ?? "");

    const collection = await getCollection(name);
    await collection.add({
      ids: [documentId],
      documents: [text]
    });

    return { output: null };
  }
}

// ---------------------------------------------------------------------------
// 10. QueryImageNode
// ---------------------------------------------------------------------------

export class QueryImageNode extends BaseNode {
  static readonly nodeType = "vector.QueryImage";
  static readonly title = "Query Image";
  static readonly description =
    "Query the index for similar images.\n    vector, RAG, query, image, search, similarity";
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: any;

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
  declare image: any;

  @prop({
    type: "int",
    default: 1,
    title: "N Results",
    description: "The number of results to return"
  })
  declare n_results: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const image = (this.image ?? this.image ?? {}) as Record<string, unknown>;
    const uri = String(image.uri ?? image.asset_id ?? "");
    if (!uri) throw new Error("Image is not connected (no uri or asset_id)");

    const nResults = Number(this.n_results ?? this.n_results ?? 1);

    const collection = await getCollection(name);
    const result = await collection.query({
      queryURIs: [uri],
      nResults,
      include: ["documents", "metadatas", "distances"]
    });

    if (!result.ids) throw new Error("Ids are not returned");
    if (!result.documents) throw new Error("Documents are not returned");
    if (!result.metadatas) throw new Error("Metadatas are not returned");
    if (!result.distances) throw new Error("Distances are not returned");

    // Sort by ID (matching Python behavior)
    const combined = result.ids[0].map((id, idx) => ({
      id: String(id),
      document: result.documents[0][idx] ?? "",
      metadata: (result.metadatas[0][idx] ?? {}) as Record<string, unknown>,
      distance: result.distances[0][idx] ?? 0
    }));
    combined.sort((a, b) => a.id.localeCompare(b.id));

    return {
      output: {
        ids: combined.map((r) => r.id),
        documents: combined.map((r) => r.document),
        metadatas: combined.map((r) => r.metadata),
        distances: combined.map((r) => r.distance)
      }
    };
  }
}

// ---------------------------------------------------------------------------
// 11. QueryTextNode
// ---------------------------------------------------------------------------

export class QueryTextNode extends BaseNode {
  static readonly nodeType = "vector.QueryText";
  static readonly title = "Query Text";
  static readonly description =
    "Query the index for similar text.\n    vector, RAG, query, text, search, similarity";
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to query"
  })
  declare text: any;

  @prop({
    type: "int",
    default: 1,
    title: "N Results",
    description: "The number of results to return"
  })
  declare n_results: any;

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const text = String(this.text ?? this.text ?? "");
    const nResults = Number(this.n_results ?? this.n_results ?? 1);

    const collection = await getCollection(name);
    const result = await collection.query({
      queryTexts: [text],
      nResults,
      include: ["documents", "metadatas", "distances"]
    });

    if (!result.ids) throw new Error("Ids are not returned");
    if (!result.documents) throw new Error("Documents are not returned");
    if (!result.metadatas) throw new Error("Metadatas are not returned");
    if (!result.distances) throw new Error("Distances are not returned");

    // Sort by ID (matching Python behavior)
    const combined = result.ids[0].map((id, idx) => ({
      id: String(id),
      document: result.documents[0][idx] ?? "",
      metadata: (result.metadatas[0][idx] ?? {}) as Record<string, unknown>,
      distance: result.distances[0][idx] ?? 0
    }));
    combined.sort((a, b) => a.id.localeCompare(b.id));

    return {
      output: {
        ids: combined.map((r) => r.id),
        documents: combined.map((r) => r.document),
        metadatas: combined.map((r) => r.metadata),
        distances: combined.map((r) => r.distance)
      }
    };
  }
}

// ---------------------------------------------------------------------------
// 12. RemoveOverlapNode
// ---------------------------------------------------------------------------

export class RemoveOverlapNode extends BaseNode {
  static readonly nodeType = "vector.RemoveOverlap";
  static readonly title = "Remove Overlap";
  static readonly description =
    "Removes overlapping words between consecutive strings in a list. Splits text into words and matches word sequences for more accurate overlap detection.\n    vector, RAG, query, text, processing, overlap, deduplication";
  static readonly metadataOutputTypes = {
    documents: "list[str]"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Documents",
    description: "List of strings to process for overlap removal"
  })
  declare documents: any;

  @prop({
    type: "int",
    default: 2,
    title: "Min Overlap Words",
    description: "Minimum number of words that must overlap to be considered"
  })
  declare min_overlap_words: any;

  private _splitIntoWords(text: string): string[] {
    return text.split(/\s+/).filter((w) => w.length > 0);
  }

  private _findWordOverlap(
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

  async process(): Promise<Record<string, unknown>> {
    const documents = (this.documents ?? this.documents ?? []) as string[];
    const minOverlapWords = Number(
      this.min_overlap_words ?? this.min_overlap_words ?? 2
    );

    if (documents.length === 0) {
      return { output: { documents: [] } };
    }

    const result: string[] = [documents[0]];

    for (let i = 1; i < documents.length; i++) {
      const prevWords = this._splitIntoWords(result[result.length - 1]);
      const currWords = this._splitIntoWords(documents[i]);

      const overlapWordCount = this._findWordOverlap(
        prevWords,
        currWords,
        minOverlapWords
      );

      if (overlapWordCount > 0) {
        const newText = currWords.slice(overlapWordCount).join(" ");
        if (newText) {
          result.push(newText);
        }
      } else {
        result.push(documents[i]);
      }
    }

    return { output: { documents: result } };
  }
}

// ---------------------------------------------------------------------------
// 13. HybridSearchNode
// ---------------------------------------------------------------------------

export class HybridSearchNode extends BaseNode {
  static readonly nodeType = "vector.HybridSearch";
  static readonly title = "Hybrid Search";
  static readonly description =
    "Hybrid search combining semantic and keyword-based search for better retrieval. Uses reciprocal rank fusion to combine results from both methods.\n    vector, RAG, query, semantic, text, similarity";
  static readonly metadataOutputTypes = {
    ids: "list[str]",
    documents: "list[str]",
    metadatas: "list[dict]",
    distances: "list[float]",
    scores: "list[float]"
  };

  @prop({
    type: "collection",
    default: {
      type: "collection",
      name: ""
    },
    title: "Collection",
    description: "The collection to query"
  })
  declare collection: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to query"
  })
  declare text: any;

  @prop({
    type: "int",
    default: 5,
    title: "N Results",
    description: "The number of final results to return"
  })
  declare n_results: any;

  @prop({
    type: "float",
    default: 60,
    title: "K Constant",
    description: "Constant for reciprocal rank fusion (default: 60.0)"
  })
  declare k_constant: any;

  @prop({
    type: "int",
    default: 3,
    title: "Min Keyword Length",
    description: "Minimum length for keyword tokens"
  })
  declare min_keyword_length: any;

  private _getKeywordQuery(
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
      return { $or: queryTokens.map((token) => ({ $contains: token })) };
    }
    return { $contains: queryTokens[0] };
  }

  async process(): Promise<Record<string, unknown>> {
    const collectionInput = (this.collection ??
      this.collection ?? { name: "" }) as {
      name: string;
    };
    const name = collectionInput.name ?? "";
    if (!name.trim()) throw new Error("Collection name cannot be empty");

    const text = String(this.text ?? this.text ?? "");
    if (!text.trim()) throw new Error("Search text cannot be empty");

    const nResults = Number(this.n_results ?? this.n_results ?? 5);
    const kConstant = Number(this.k_constant ?? this.k_constant ?? 60.0);
    const minKeywordLength = Number(
      this.min_keyword_length ?? this.min_keyword_length ?? 3
    );

    const collection = await getCollection(name);

    // Semantic search
    const semanticResult = await collection.query({
      queryTexts: [text],
      nResults: nResults * 2,
      include: ["documents", "metadatas", "distances"]
    });

    // Keyword search
    const keywordQuery = this._getKeywordQuery(text, minKeywordLength);
    let keywordResult = semanticResult;
    if (keywordQuery) {
      keywordResult = await collection.query({
        queryTexts: [text],
        nResults: nResults * 2,
        whereDocument: keywordQuery as Record<string, unknown>,
        include: ["documents", "metadatas", "distances"]
      });
    }

    // Validate
    for (const res of [semanticResult, keywordResult]) {
      if (!res.ids) throw new Error("Ids are not returned");
      if (!res.documents) throw new Error("Documents are not returned");
      if (!res.metadatas) throw new Error("Metadatas are not returned");
      if (!res.distances) throw new Error("Distances are not returned");
    }

    // Reciprocal rank fusion
    const combinedScores = new Map<
      string,
      {
        doc: string;
        meta: Record<string, unknown>;
        distance: number;
        score: number;
      }
    >();

    const processResults = (
      ids: string[],
      docs: (string | null)[],
      metas: (Record<string, unknown> | null)[],
      distances: (number | null)[]
    ) => {
      ids.forEach((id, rank) => {
        const strId = String(id);
        const score = 1 / (rank + kConstant);
        if (combinedScores.has(strId)) {
          combinedScores.get(strId)!.score += score;
        } else {
          combinedScores.set(strId, {
            doc: docs[rank] ?? "",
            meta: (metas[rank] ?? {}) as Record<string, unknown>,
            distance: distances[rank] ?? 0,
            score
          });
        }
      });
    };

    processResults(
      semanticResult.ids[0].map(String),
      semanticResult.documents[0],
      semanticResult.metadatas[0] as (Record<string, unknown> | null)[],
      semanticResult.distances[0]
    );
    processResults(
      keywordResult.ids[0].map(String),
      keywordResult.documents[0],
      keywordResult.metadatas[0] as (Record<string, unknown> | null)[],
      keywordResult.distances[0]
    );

    // Sort by combined score descending
    const sorted = [...combinedScores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, nResults);

    const resultIds: string[] = [];
    const resultDocs: string[] = [];
    const resultMetas: Record<string, unknown>[] = [];
    const resultDistances: number[] = [];
    const resultScores: number[] = [];

    for (const [id, data] of sorted) {
      resultIds.push(id);
      resultDocs.push(data.doc);
      resultMetas.push(data.meta);
      resultDistances.push(data.distance);
      resultScores.push(data.score);
    }

    return {
      output: {
        ids: resultIds,
        documents: resultDocs,
        metadatas: resultMetas,
        distances: resultDistances,
        scores: resultScores
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const VECTOR_NODES: readonly NodeClass[] = [
  CollectionNode as unknown as NodeClass,
  CountNode as unknown as NodeClass,
  GetDocumentsNode as unknown as NodeClass,
  PeekNode as unknown as NodeClass,
  IndexImageNode as unknown as NodeClass,
  IndexEmbeddingNode as unknown as NodeClass,
  IndexTextChunkNode as unknown as NodeClass,
  IndexAggregatedTextNode as unknown as NodeClass,
  IndexStringNode as unknown as NodeClass,
  QueryImageNode as unknown as NodeClass,
  QueryTextNode as unknown as NodeClass,
  RemoveOverlapNode as unknown as NodeClass,
  HybridSearchNode as unknown as NodeClass
];
