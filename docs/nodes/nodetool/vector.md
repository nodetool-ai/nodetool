# nodetool.nodes.nodetool.vector

## ChromaNode

**Inherits from:** BaseNode


#### `get_or_create_collection`

Get or create a collection with the given name.

        Args:
            context: The processing context.
            name: The name of the collection to get or create.

**Parameters:**

- `context` (ProcessingContext)
- `name` (str)

#### `load_results`

**Parameters:**

- `context` (ProcessingContext)
- `ids` (list[str])

**Returns:** `list[nodetool.metadata.types.AssetRef]`

## IndexFolder

Index all the assets in a folder.

**Inherits from:** ChromaNode

- **folder**: The folder to index (`FolderRef`)

## NearestNeighbors

Stores input embeddings in a database and retrieves the nearest neighbors for a query embedding.

**Inherits from:** BaseNode

- **documents**: The list of documents to search (`list[nodetool.metadata.types.Tensor]`)
- **query**: The query to search for (`Tensor`)
- **n_neighbors**: The number of neighbors to return (`int`)

## QueryImage

Query the index for similar images.

**Inherits from:** ChromaNode

- **folder**: The folder to query (`FolderRef`)
- **image**: The image to query (`ImageRef`)
- **n_results**: The number of results to return (`int`)

## QueryText

Query the index for similar text.

**Inherits from:** ChromaNode

- **folder**: The folder to query (`FolderRef`)
- **text**: The text to query (`TextRef`)
- **n_results**: The number of results to return (`int`)

