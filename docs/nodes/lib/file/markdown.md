# nodetool.nodes.lib.file.markdown

## ExtractBulletLists

Extracts bulleted lists from markdown.

Use cases:
- Extract unordered list items
- Analyze bullet point structures
- Convert bullet lists to structured data

**Tags:** markdown, lists, bullets, extraction

**Fields:**
- **markdown**: The markdown text to analyze (str)


## ExtractCodeBlocks

Extracts code blocks and their languages from markdown.

Use cases:
- Extract code samples for analysis
- Collect programming examples
- Analyze code snippets in documentation

**Tags:** markdown, code, extraction

**Fields:**
- **markdown**: The markdown text to analyze (str)


## ExtractHeaders

Extracts headers and creates a document structure/outline.

Use cases:
- Generate table of contents
- Analyze document structure
- Extract main topics from documents

**Tags:** markdown, headers, structure

**Fields:**
- **markdown**: The markdown text to analyze (str)
- **max_level**: Maximum header level to extract (1-6) (int)


## ExtractLinks

Extracts all links from markdown text.

Use cases:
- Extract references and citations from academic documents
- Build link graphs from markdown documentation
- Analyze external resources referenced in markdown files

**Tags:** markdown, links, extraction

**Fields:**
- **markdown**: The markdown text to analyze (str)
- **include_titles**: Whether to include link titles in output (bool)


## ExtractNumberedLists

Extracts numbered lists from markdown.

Use cases:
- Extract ordered list items
- Analyze enumerated structures
- Convert numbered lists to structured data

**Tags:** markdown, lists, numbered, extraction

**Fields:**
- **markdown**: The markdown text to analyze (str)


## ExtractTables

Extracts tables from markdown and converts them to structured data.

Use cases:
- Extract tabular data from markdown
- Convert markdown tables to structured formats
- Analyze tabulated information

**Tags:** markdown, tables, data

**Fields:**
- **markdown**: The markdown text to analyze (str)


