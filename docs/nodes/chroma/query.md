# nodetool.nodes.chroma.query

## QueryDocuments

Query the index for similar documents and return their content.

**Fields:**
- **collection**: The collection to query (ChromaCollection)
- **text**: The text to query (str)
- **n_results**: The number of results to return (int)


## QueryImage

Query the index for similar images.

**Fields:**
- **collection**: The collection to query (ChromaCollection)
- **image**: The image to query (ImageRef)
- **n_results**: The number of results to return (int)


