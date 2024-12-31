# nodetool.nodes.nodetool.file.docx

## AddHeading

Adds a heading to the document

**Fields:**
- **document**: The document to add the heading to (DocumentRef)
- **text**: The heading text (str)
- **level**: Heading level (1-9) (int)


## AddImage

Adds an image to the document

**Fields:**
- **document**: The document to add the image to (DocumentRef)
- **image**: The image to add (ImageRef)
- **width**: Image width in inches (typing.Optional[float])
- **height**: Image height in inches (typing.Optional[float])


## AddPageBreak

Adds a page break to the document

**Fields:**
- **document**: The document to add the page break to (DocumentRef)


## AddParagraph

Adds a paragraph of text to the document

**Fields:**
- **document**: The document to add the paragraph to (DocumentRef)
- **text**: The paragraph text (str)
- **alignment**: Text alignment (ParagraphAlignment)
- **bold**: Make text bold (bool)
- **italic**: Make text italic (bool)
- **font_size**: Font size in points (typing.Optional[int])


## AddTable

Adds a table to the document

**Fields:**
- **document**: The document to add the table to (DocumentRef)
- **rows**: Number of rows (int)
- **cols**: Number of columns (int)
- **data**: Table data as nested lists (typing.List[typing.List[str]])


## CreateDocument

Creates a new Word document

**Fields:**


## LoadWordDocument

Loads a Word document from disk

**Fields:**
- **path**: Path to the document to load (str)


## ParagraphAlignment

## SaveDocument

Writes the document to a file

**Fields:**
- **document**: The document to write (DocumentRef)
- **path**: The path to write the document to (FilePath)


## SetDocumentProperties

Sets document metadata properties

**Fields:**
- **document**: The document to modify (DocumentRef)
- **title**: Document title (str)
- **author**: Document author (str)
- **subject**: Document subject (str)
- **keywords**: Document keywords (str)


