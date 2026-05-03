/**
 * Pinecone implementation of the VectorProvider interface.
 *
 * Stub: only the constructor / config validation is wired up. Each method
 * documents the Pinecone REST/SDK call it should make. Implementing this
 * adapter is a matter of pulling in `@pinecone-database/pinecone` and
 * mapping our types onto its `Index` and `Vector` shapes.
 */

import {
  ProviderConfigError,
  type CollectionInfo,
  type CreateCollectionOptions,
  type GetCollectionOptions,
  type VectorCollection,
  type VectorProvider
} from "./provider.js";

export interface PineconeProviderOptions {
  apiKey: string;
  /** Pinecone control-plane environment, e.g. "us-east-1-aws". */
  environment?: string;
  /** Project / controller host. */
  controllerHostUrl?: string;
}

export class PineconeProvider implements VectorProvider {
  readonly name = "pinecone";

  readonly apiKey: string;
  readonly environment?: string;
  readonly controllerHostUrl?: string;

  constructor(opts: PineconeProviderOptions) {
    if (!opts.apiKey) {
      throw new ProviderConfigError("PineconeProvider requires apiKey");
    }
    this.apiKey = opts.apiKey;
    this.environment = opts.environment;
    this.controllerHostUrl = opts.controllerHostUrl;
  }

  listCollections(): Promise<CollectionInfo[]> {
    // Maps to: pinecone.listIndexes()
    throw notImplemented();
  }

  getCollection(_opts: GetCollectionOptions): Promise<VectorCollection> {
    // Maps to: pinecone.index(name)
    throw notImplemented();
  }

  createCollection(_opts: CreateCollectionOptions): Promise<VectorCollection> {
    // Maps to: pinecone.createIndex({ name, dimension, metric })
    // `dimension` is REQUIRED by Pinecone — surface clearly if missing.
    throw notImplemented();
  }

  getOrCreateCollection(
    _opts: CreateCollectionOptions
  ): Promise<VectorCollection> {
    throw notImplemented();
  }

  deleteCollection(_name: string): Promise<void> {
    // Maps to: pinecone.deleteIndex(name)
    throw notImplemented();
  }

  close(): void {
    // No persistent connection.
  }
}

// Method stubs deliberately left for future implementation. The collection
// shape will look like:
//
//   class PineconeCollection implements VectorCollection {
//     constructor(private index: PineconeIndex) {}
//     upsert(records) → index.upsert(records.map(toPineconeVector))
//     query({ embedding, topK, filter }) →
//       index.query({ vector, topK, filter, includeMetadata: true })
//     delete(ids) → index.deleteMany(ids)
//     get({ ids }) → index.fetch(ids)
//   }

function notImplemented(): Error {
  return new Error(
    "PineconeProvider is not yet implemented — install @pinecone-database/pinecone and wire up the methods."
  );
}
