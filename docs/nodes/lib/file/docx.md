# nodetool.nodes.lib.file.docx

## AddHeading

Adds a heading to the document

**Tags:** document, docx, heading, format

**Fields:**
- **document**: The document to add the heading to (DocumentRef)
- **text**: The heading text (str)
- **level**: Heading level (1-9) (int)


## AddImage

Adds an image to the document

**Tags:** document, docx, image, format

**Fields:**
- **document**: The document to add the image to (DocumentRef)
- **image**: The image to add (ImageRef)
- **width**: Image width in inches (typing.Optional[float])
- **height**: Image height in inches (typing.Optional[float])


## AddPageBreak

Adds a page break to the document

**Tags:** document, docx, format, layout

**Fields:**
- **document**: The document to add the page break to (DocumentRef)


## AddParagraph

Adds a paragraph of text to the document

**Tags:** document, docx, text, format

**Fields:**
- **document**: The document to add the paragraph to (DocumentRef)
- **text**: The paragraph text (str)
- **alignment**: Text alignment (ParagraphAlignment)
- **bold**: Make text bold (bool)
- **italic**: Make text italic (bool)
- **font_size**: Font size in points (typing.Optional[int])


## AddTable

Adds a table to the document

**Tags:** document, docx, table, format

**Fields:**
- **document**: The document to add the table to (DocumentRef)
- **rows**: Number of rows (int)
- **cols**: Number of columns (int)
- **data**: Table data as nested lists (typing.List[typing.List[str]])


## CreateDocument

Creates a new Word document

**Tags:** document, docx, file, create

**Fields:**


## LoadWordDocument

Loads a Word document from disk

**Tags:** document, docx, file, load, input

**Fields:**
- **path**: Path to the document to load (str)


## ParagraphAlignment

## SaveDocument

Writes the document to a file

**Tags:** document, docx, file, save, output

**Fields:**
- **document**: The document to write (DocumentRef)
- **path**: 
        The path to write the document to.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (FilePath)


## SetDocumentProperties

Sets document metadata properties

**Tags:** document, docx, metadata, properties

**Fields:**
- **document**: The document to modify (DocumentRef)
- **title**: Document title (str)
- **author**: Document author (str)
- **subject**: Document subject (str)
- **keywords**: Document keywords (str)


