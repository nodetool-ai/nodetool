# nodetool.nodes.chroma.index

## IndexImage

Index a single image asset.

**Tags:** chroma, embedding, collection, RAG, index, image

**Fields:**
- **collection**: The collection to index (Collection)
- **image**: Image asset to index (ImageRef)


## IndexImages

Index a list of image assets or files.

**Tags:** chroma, embedding, collection, RAG, index, image, batch

**Fields:**
- **collection**: The collection to index (Collection)
- **images**: List of image assets to index (list)
- **upsert**: Whether to upsert the images (bool)


## IndexString

Index a string with a Document ID to a collection.

Use cases:
- Index documents for a vector search

**Tags:** chroma, embedding, collection, RAG, index, text, string

**Fields:**
- **collection**: The collection to index (Collection)
- **text**: Text content to index (str)
- **document_id**: Document ID to associate with the text content (str)


## IndexText

Index a single text asset.

**Tags:** chroma, embedding, collection, RAG, index, text

**Fields:**
- **collection**: The collection to index (Collection)
- **text**: Text asset to index (TextRef)


## IndexTextChunk

Index a single text chunk.

**Tags:** chroma, embedding, collection, RAG, index, text, chunk

**Fields:**
- **collection**: The collection to index (Collection)
- **text_chunk**: Text chunk to index (TextChunk)


## IndexTextChunks

Index multiple text chunks at once.

**Tags:** chroma, embedding, collection, RAG, index, text, chunk, batch

**Fields:**
- **collection**: The collection to index (Collection)
- **text_chunks**: List of text chunks to index (typing.List[nodetool.metadata.types.TextChunk])


## IndexTexts

Index a list of text assets or files.

**Tags:** chroma, embedding, collection, RAG, index, text, batch

**Fields:**
- **collection**: The collection to index (Collection)
- **docs**: Dictionary of ID to text content pairs to index (list)


