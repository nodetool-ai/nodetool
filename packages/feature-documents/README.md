# Document execution feature

Install `@nodetool-ai/feature-documents` beside the minimal server, then set
`NODETOOL_FEATURES=document=@nodetool-ai/feature-documents`. Registers the existing
`lib.pdf.ExtractText` node with page-range properties and tenant-scoped persistent
asset references. This feature extracts PDF text layers. It does not run OCR.
