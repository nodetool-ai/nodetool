# nodetool.nodes.lib.data.langchain

## MarkdownSplitter

Splits markdown text by headers while preserving header hierarchy in metadata.

Use cases:
- Splitting markdown documentation while preserving structure
- Processing markdown files for semantic search
- Creating context-aware chunks from markdown content

**Tags:** markdown, split, headers

**Fields:**
- **text** (str)
- **source_id** (str)
- **headers_to_split_on**: List of tuples containing (header_symbol, header_name) (list[tuple[str, str]])
- **strip_headers**: Whether to remove headers from the output content (bool)
- **return_each_line**: Whether to split into individual lines instead of header sections (bool)
- **chunk_size**: Optional maximum chunk size for further splitting (int | None)
- **chunk_overlap**: Overlap size when using chunk_size (int)


## RecursiveTextSplitter

Splits text recursively using LangChain's RecursiveCharacterTextSplitter.

Use cases:
- Splitting documents while preserving semantic relationships
- Creating chunks for language model processing
- Handling text in languages with/without word boundaries

**Tags:** text, split, chunks

**Fields:**
- **text** (str)
- **source_id** (str)
- **chunk_size**: Maximum size of each chunk in characters (int)
- **chunk_overlap**: Number of characters to overlap between chunks (int)
- **separators**: List of separators to use for splitting, in order of preference (list[str])


