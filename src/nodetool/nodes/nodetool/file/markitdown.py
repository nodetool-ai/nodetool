import os
import tempfile
from markitdown import MarkItDown
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DocumentRef


class ConvertToMarkdown(BaseNode):
    """
    Converts various document formats to markdown using MarkItDown.
    markdown, convert, document

    Use cases:
    - Convert Word documents to markdown
    - Convert Excel files to markdown tables
    - Convert PowerPoint to markdown content
    """

    document: DocumentRef = Field(
        default=DocumentRef(), description="The document to convert to markdown"
    )

    async def process(self, context: ProcessingContext) -> str:
        try:
            if self.document.uri:
                uri = self.document.uri
                temp_file = None
                if uri.startswith("file://"):
                    uri = uri[7:]
            else:
                bytes = await context.asset_to_bytes(self.document)
                temp_file = tempfile.NamedTemporaryFile(delete=False)
                temp_file.write(bytes)
                temp_file.flush()
                uri = temp_file.name

            md = MarkItDown()

            # Convert document to markdown
            result = md.convert(uri)

            # Return the markdown text content
            return result.text_content
        finally:
            if temp_file:
                temp_file.close()
                os.remove(temp_file.name)
