# nodetool.nodes.chroma.index

## IndexFolder

Index all the assets in a folder.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **folder**: The folder to index (FolderRef)


## IndexImageList

Index a list of image assets.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **images**: List of image assets to index (list[nodetool.metadata.types.ImageRef])


## IndexTextList

Index a list of text assets.

**Fields:**
- **collection**: The collection to index (ChromaCollection)
- **docs**: Dictionary of ID to text content pairs to index (list[nodetool.metadata.types.TextRef])


