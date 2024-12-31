# nodetool.nodes.chroma.collections

## CollectionNode

**Fields:**
- **name**: The name of the collection to get or create. (str)
- **embedding_function** (ChromaEmbeddingFunction)


## Count

Count the number of documents in a collection.

**Fields:**
- **collection**: The collection to count (ChromaCollection)


## GetDocuments

Get documents from a chroma collection.

**Fields:**
- **collection**: The collection to get (ChromaCollection)
- **ids**: The ids of the documents to get (list[str])
- **limit**: The limit of the documents to get (int)
- **offset**: The offset of the documents to get (int)


## Peek

Peek at the documents in a collection.

**Fields:**
- **collection**: The collection to peek (ChromaCollection)
- **limit**: The limit of the documents to peek (int)


