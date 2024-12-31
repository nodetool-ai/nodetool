# nodetool.nodes.nodetool.file.pdf

## ExtractImages

Extract images from a PDF file.

Use cases:
- Extract embedded images from PDF documents
- Save PDF images as separate files
- Process PDF images for analysis

**Tags:** pdf, image, extract

**Fields:**
- **pdf**: The PDF file to extract images from (DocumentRef)
- **start_page**: The start page to extract (int)
- **end_page**: The end page to extract (int)


## ExtractPageMetadata

Extract metadata from PDF pages like dimensions, rotation, etc.

Use cases:
- Analyze page layouts
- Get page dimensions
- Check page orientations

**Tags:** pdf, metadata, pages

**Fields:**
- **pdf**: The PDF file to analyze (DocumentRef)
- **start_page**: The start page to extract. 0-based indexing (int)
- **end_page**: The end page to extract. -1 for all pages (int)


## ExtractText

Extract text content from a PDF file.

Use cases:
- Convert PDF documents to plain text
- Extract content for analysis
- Enable text search in PDF documents

**Tags:** pdf, text, extract

**Fields:**
- **pdf**: The PDF file to extract text from (DocumentRef)
- **start_page**: The start page to extract. 0-based indexing (int)
- **end_page**: The end page to extract. -1 for all pages (int)


## GetPageCount

Get the total number of pages in a PDF file.

Use cases:
- Check document length
- Plan batch processing

**Tags:** pdf, pages, count

**Fields:**
- **pdf**: The PDF file to analyze (DocumentRef)


