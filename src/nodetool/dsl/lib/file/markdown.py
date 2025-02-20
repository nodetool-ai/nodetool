from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ExtractBulletLists(GraphNode):
    """
    Extracts bulleted lists from markdown.
    markdown, lists, bullets, extraction

    Use cases:
    - Extract unordered list items
    - Analyze bullet point structures
    - Convert bullet lists to structured data
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractBulletLists"



class ExtractCodeBlocks(GraphNode):
    """
    Extracts code blocks and their languages from markdown.
    markdown, code, extraction

    Use cases:
    - Extract code samples for analysis
    - Collect programming examples
    - Analyze code snippets in documentation
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractCodeBlocks"



class ExtractHeaders(GraphNode):
    """
    Extracts headers and creates a document structure/outline.
    markdown, headers, structure

    Use cases:
    - Generate table of contents
    - Analyze document structure
    - Extract main topics from documents
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')
    max_level: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Maximum header level to extract (1-6)')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractHeaders"



class ExtractLinks(GraphNode):
    """
    Extracts all links from markdown text.
    markdown, links, extraction

    Use cases:
    - Extract references and citations from academic documents
    - Build link graphs from markdown documentation
    - Analyze external resources referenced in markdown files
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')
    include_titles: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to include link titles in output')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractLinks"



class ExtractNumberedLists(GraphNode):
    """
    Extracts numbered lists from markdown.
    markdown, lists, numbered, extraction

    Use cases:
    - Extract ordered list items
    - Analyze enumerated structures
    - Convert numbered lists to structured data
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractNumberedLists"



class ExtractTables(GraphNode):
    """
    Extracts tables from markdown and converts them to structured data.
    markdown, tables, data

    Use cases:
    - Extract tabular data from markdown
    - Convert markdown tables to structured formats
    - Analyze tabulated information
    """

    markdown: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The markdown text to analyze')

    @classmethod
    def get_node_type(cls): return "lib.file.markdown.ExtractTables"


