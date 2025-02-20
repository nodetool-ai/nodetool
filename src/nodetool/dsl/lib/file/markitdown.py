from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConvertToMarkdown(GraphNode):
    """
    Converts various document formats to markdown using MarkItDown.
    markdown, convert, document

    Use cases:
    - Convert Word documents to markdown
    - Convert Excel files to markdown tables
    - Convert PowerPoint to markdown content
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to convert to markdown')

    @classmethod
    def get_node_type(cls): return "lib.file.markitdown.ConvertToMarkdown"


