from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ExtractImages(GraphNode):
    """
    Extract images from a PDF file.
    pdf, image, extract

    Use cases:
    - Extract embedded images from PDF documents
    - Save PDF images as separate files
    - Process PDF images for analysis
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The PDF file to extract images from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The start page to extract')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The end page to extract')

    @classmethod
    def get_node_type(cls): return "lib.file.pdfplumber.ExtractImages"



class ExtractPageMetadata(GraphNode):
    """
    Extract metadata from PDF pages like dimensions, rotation, etc.
    pdf, metadata, pages

    Use cases:
    - Analyze page layouts
    - Get page dimensions
    - Check page orientations
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The PDF file to analyze')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The start page to extract. 0-based indexing')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The end page to extract. -1 for all pages')

    @classmethod
    def get_node_type(cls): return "lib.file.pdfplumber.ExtractPageMetadata"



class ExtractTables(GraphNode):
    """
    Extract tables from a PDF file into dataframes.
    pdf, tables, dataframe, extract

    Use cases:
    - Extract tabular data from PDF documents
    - Convert PDF tables to structured data formats
    - Process PDF tables for analysis
    - Import PDF reports into data analysis pipelines
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF document to extract tables from')
    pages: List | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Specific pages to extract tables from (None for all pages)')
    table_settings: dict | GraphNode | tuple[GraphNode, str] = Field(default={'vertical_strategy': 'text', 'horizontal_strategy': 'text', 'snap_tolerance': 3, 'join_tolerance': 3, 'edge_min_length': 3, 'min_words_vertical': 3, 'min_words_horizontal': 1, 'keep_blank_chars': False, 'text_tolerance': 3, 'text_x_tolerance': 3, 'text_y_tolerance': 3}, description='Settings for table extraction algorithm')

    @classmethod
    def get_node_type(cls): return "lib.file.pdfplumber.ExtractTables"



class ExtractText(GraphNode):
    """
    Extract text content from a PDF file.
    pdf, text, extract

    Use cases:
    - Convert PDF documents to plain text
    - Extract content for analysis
    - Enable text search in PDF documents
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The PDF file to extract text from')
    start_page: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The start page to extract. 0-based indexing')
    end_page: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The end page to extract. -1 for all pages')

    @classmethod
    def get_node_type(cls): return "lib.file.pdfplumber.ExtractText"



class GetPageCount(GraphNode):
    """
    Get the total number of pages in a PDF file.
    pdf, pages, count

    Use cases:
    - Check document length
    - Plan batch processing
    """

    pdf: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The PDF file to analyze')

    @classmethod
    def get_node_type(cls): return "lib.file.pdfplumber.GetPageCount"


