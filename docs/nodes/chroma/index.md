# nodetool.nodes.chroma.index

## IndexImage

Index a single image asset.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **image**: Image asset to index (ImageRef)


## IndexImages

Index a list of image assets or files.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **images**: List of image assets to index (list[nodetool.metadata.types.ImageRef])


## IndexString

Index a string with a Document ID to a collection.

Use cases:
- Index documents for a vector search

**Tags:** text, document_id, collection, index, save

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **text**: Text content to index (str)
- **document_id**: Document ID to associate with the text content (str)


## IndexText

Index a single text asset.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **text**: Text asset to index (TextRef)


## IndexTextChunk

Index a single text chunk.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **text_chunk**: Text chunk to index (TextChunk)


## IndexTextChunks

Index multiple text chunks at once.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **text_chunks**: List of text chunks to index (typing.List[nodetool.metadata.types.TextChunk])


## IndexTexts

Index a list of text assets or files.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **docs**: Dictionary of ID to text content pairs to index (list[nodetool.metadata.types.TextRef])


