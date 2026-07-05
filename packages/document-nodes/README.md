# @nodetool-ai/document-nodes

PDF, DOCX, EPUB, and PPTX document nodes for [NodeTool](https://nodetool.ai).

Read, write, split, and convert documents in visual AI workflows: extract text,
tables, and Markdown from PDFs, build Word documents, parse EPUB chapters and
PowerPoint slides, and chunk text for RAG pipelines.

## Install

```bash
npm install @nodetool-ai/document-nodes
```

## Nodes

**Document** (`nodetool.document.*`) — load and save documents
(`LoadDocumentFile`, `SaveDocumentFile`, `ListDocuments`) and split text into
chunks for indexing: `SplitDocument`, `SplitRecursively`, `SplitMarkdown`,
`SplitHTML`, `SplitJSON`.

**PDF** (`lib.pdf.*`) — `PageCount`, `PageMetadata`, `ExtractText`,
`ExtractMarkdown`, `ExtractStyledText`, `ExtractTextBlocks`, `ExtractTables`,
`ExtractOcr`, `SearchText`, `Screenshot`, `Pdftoppm`.

**DOCX** (`lib.docx.*`) — build and read Word documents: `CreateDocument`,
`LoadWordDocument`, `AddHeading`, `AddParagraph`, `AddTable`, `AddImage`,
`AddPageBreak`, `SetDocumentProperties`, `SaveDocument`.

**EPUB** (`lib.epub.*`) — `Metadata`, `TableOfContents`, `ExtractText`,
`ExtractChapters`.

**PPTX** (`lib.pptx.*`) — `ExtractText`, `ExtractSlides`.

**Convert** (`lib.convert.*`) — `ConvertToMarkdown`, plus pandoc-backed
`pandoc.ConvertText` and `pandoc.ConvertFile`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
