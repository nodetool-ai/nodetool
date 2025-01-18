# nodetool.nodes.nodetool.file.pandoc

## ConvertFile

Converts between different document formats using pandoc.

Use cases:
- Convert between various document formats (Markdown, HTML, LaTeX, etc.)
- Generate documentation in different formats
- Create publication-ready documents

**Tags:** convert, document, format, pandoc

**Fields:**
- **input_path**: Path to the input file (FilePath)
- **input_format**: Input format (InputFormat)
- **output_format**: Output format (OutputFormat)
- **extra_args**: Additional pandoc arguments (list)


## ConvertText

Converts text content between different document formats using pandoc.

Use cases:
- Convert text content between various formats (Markdown, HTML, LaTeX, etc.)
- Transform content without saving to disk
- Process text snippets in different formats

**Tags:** convert, text, format, pandoc

**Fields:**
- **content**: Text content to convert (str)
- **input_format**: Input format (InputFormat)
- **output_format**: Output format (OutputFormat)
- **extra_args**: Additional pandoc arguments (list)


## InputFormat

An enumeration.

## OutputFormat

Pandoc output-only formats

