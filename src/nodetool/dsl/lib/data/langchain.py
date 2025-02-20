from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class MarkdownSplitter(GraphNode):
    """
    Splits markdown text by headers while preserving header hierarchy in metadata.
    markdown, split, headers

    Use cases:
    - Splitting markdown documentation while preserving structure
    - Processing markdown files for semantic search
    - Creating context-aware chunks from markdown content
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the text')
    headers_to_split_on: list[tuple[str, str]] | GraphNode | tuple[GraphNode, str] = Field(default=[('#', 'Header 1'), ('##', 'Header 2'), ('###', 'Header 3')], description='List of tuples containing (header_symbol, header_name)')
    strip_headers: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to remove headers from the output content')
    return_each_line: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to split into individual lines instead of header sections')
    chunk_size: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional maximum chunk size for further splitting')
    chunk_overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Overlap size when using chunk_size')

    @classmethod
    def get_node_type(cls): return "lib.data.langchain.MarkdownSplitter"



class RecursiveTextSplitter(GraphNode):
    """
    Splits text recursively using LangChain's RecursiveCharacterTextSplitter.
    text, split, chunks

    Use cases:
    - Splitting documents while preserving semantic relationships
    - Creating chunks for language model processing
    - Handling text in languages with/without word boundaries
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the text')
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='Maximum size of each chunk in characters')
    chunk_overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='Number of characters to overlap between chunks')
    separators: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=['\n\n', '\n', '.'], description='List of separators to use for splitting, in order of preference')

    @classmethod
    def get_node_type(cls): return "lib.data.langchain.RecursiveTextSplitter"



class SentenceSplitter(GraphNode):
    """
    Splits text into sentences using LangChain's SentenceTransformersTokenTextSplitter.
    sentences, split, nlp

    Use cases:
    - Natural sentence-based text splitting
    - Creating semantically meaningful chunks
    - Processing text for sentence-level analysis
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the text')
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='Maximum number of tokens per chunk')
    chunk_overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of tokens to overlap between chunks')

    @classmethod
    def get_node_type(cls): return "lib.data.langchain.SentenceSplitter"


