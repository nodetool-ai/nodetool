from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ExtractMarkdown(GraphNode):
    """
    Convert PDF to Markdown format using pymupdf4llm.
    pdf, markdown, convert

    Use cases:
    - Convert PDF documents to markdown format
    - Preserve document structure in markdown
    - Create editable markdown from PDFs
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to convert to markdown')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First page to extract (0-based index)')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Last page to extract (-1 for last page)')

    @classmethod
    def get_node_type(cls): return "lib.file.pymupdf.ExtractMarkdown"



class ExtractTables(GraphNode):
    """
    Extract tables from a PDF document using PyMuPDF.
    pdf, tables, extract, structured

    Use cases:
    - Extract tabular data from PDFs
    - Convert PDF tables to structured formats
    - Analyze table layouts and content
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to extract tables from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First page to extract (0-based index)')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Last page to extract (-1 for last page)')

    @classmethod
    def get_node_type(cls): return "lib.file.pymupdf.ExtractTables"



class ExtractText(GraphNode):
    """
    Extract plain text from a PDF document using PyMuPDF.
    pdf, text, extract

    Use cases:
    - Extract raw text content from PDFs
    - Convert PDF documents to plain text
    - Prepare text for further processing
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to extract text from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First page to extract (0-based index)')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Last page to extract (-1 for last page)')

    @classmethod
    def get_node_type(cls): return "lib.file.pymupdf.ExtractText"



class ExtractTextBlocks(GraphNode):
    """
    Extract text blocks with their bounding boxes from a PDF.
    pdf, text, blocks, layout

    Use cases:
    - Analyze text layout and structure
    - Extract text while preserving block-level formatting
    - Get text position information
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to extract text blocks from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First page to extract (0-based index)')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Last page to extract (-1 for last page)')

    @classmethod
    def get_node_type(cls): return "lib.file.pymupdf.ExtractTextBlocks"



class ExtractTextWithStyle(GraphNode):
    """
    Extract text with style information (font, size, color) from a PDF.
    pdf, text, style, formatting

    Use cases:
    - Preserve text formatting during extraction
    - Analyze document styling
    - Extract text with font information
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to extract styled text from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='First page to extract (0-based index)')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Last page to extract (-1 for last page)')

    @classmethod
    def get_node_type(cls): return "lib.file.pymupdf.ExtractTextWithStyle"


