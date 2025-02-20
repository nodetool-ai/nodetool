from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextChunk
from nodetool.workflows.base_node import BaseNode
import json
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


class RecursiveTextSplitter(BaseNode):
    """
    Splits text recursively using LangChain's RecursiveCharacterTextSplitter.
    text, split, chunks

    Use cases:
    - Splitting documents while preserving semantic relationships
    - Creating chunks for language model processing
    - Handling text in languages with/without word boundaries
    """

    text: str = Field(title="Text", default="")
    document_id: str = Field(
        default="", description="Document ID to associate with the text"
    )
    chunk_size: int = Field(
        default=1000,
        description="Maximum size of each chunk in characters",
    )
    chunk_overlap: int = Field(
        title="Chunk Overlap",
        default=200,
        description="Number of characters to overlap between chunks",
    )
    separators: list[str] = Field(
        default=["\n\n", "\n", "."],
        description="List of separators to use for splitting, in order of preference",
    )

    @classmethod
    def get_title(cls):
        return "Split Recursively"

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_core.documents import Document

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators,
            length_function=len,
            is_separator_regex=False,
            add_start_index=True,
        )

        docs = splitter.split_documents([Document(page_content=self.text)])

        return [
            TextChunk(
                text=doc.page_content,
                source_id=f"{self.document_id}:{i}",
                start_index=doc.metadata["start_index"],
            )
            for i, doc in enumerate(docs)
        ]


class MarkdownSplitter(BaseNode):
    """
    Splits markdown text by headers while preserving header hierarchy in metadata.
    markdown, split, headers

    Use cases:
    - Splitting markdown documentation while preserving structure
    - Processing markdown files for semantic search
    - Creating context-aware chunks from markdown content
    """

    text: str = Field(title="Markdown Text", default="")
    document_id: str = Field(
        default="", description="Document ID to associate with the text"
    )
    headers_to_split_on: list[tuple[str, str]] = Field(
        default=[
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
        ],
        description="List of tuples containing (header_symbol, header_name)",
    )
    strip_headers: bool = Field(
        default=True,
        description="Whether to remove headers from the output content",
    )
    return_each_line: bool = Field(
        default=False,
        description="Whether to split into individual lines instead of header sections",
    )
    chunk_size: int | None = Field(
        default=None,
        description="Optional maximum chunk size for further splitting",
    )
    chunk_overlap: int = Field(
        default=30,
        description="Overlap size when using chunk_size",
    )

    @classmethod
    def get_title(cls):
        return "Split Markdown"

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import (
            MarkdownHeaderTextSplitter,
            RecursiveCharacterTextSplitter,
        )

        # Initialize markdown splitter
        markdown_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=self.headers_to_split_on,
            strip_headers=self.strip_headers,
            return_each_line=self.return_each_line,
        )

        # Split by headers
        splits = markdown_splitter.split_text(self.text)

        # Further split by chunk size if specified
        if self.chunk_size:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size, chunk_overlap=self.chunk_overlap
            )
            splits = text_splitter.split_documents(splits)

        # Convert Document objects to dictionaries
        return [
            TextChunk(
                text=doc.page_content,
                source_id=self.document_id,
                start_index=doc.metadata["start_index"],
            )
            for doc in splits
        ]


class SentenceSplitter(BaseNode):
    """
    Splits text into sentences using LangChain's SentenceTransformersTokenTextSplitter.
    sentences, split, nlp

    Use cases:
    - Natural sentence-based text splitting
    - Creating semantically meaningful chunks
    - Processing text for sentence-level analysis
    """

    text: str = Field(title="Text", default="")
    document_id: str = Field(
        default="", description="Document ID to associate with the text"
    )
    chunk_size: int = Field(
        default=40,
        description="Maximum number of tokens per chunk",
    )
    chunk_overlap: int = Field(
        default=5,
        description="Number of tokens to overlap between chunks",
    )

    @classmethod
    def get_title(cls):
        return "Split into Sentences"

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import SentenceTransformersTokenTextSplitter
        from langchain_core.documents import Document

        splitter = SentenceTransformersTokenTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            add_start_index=True,
        )

        docs = splitter.split_documents([Document(page_content=self.text)])

        return [
            TextChunk(
                text=doc.page_content,
                source_id=f"{self.document_id}:{i}",
                start_index=doc.metadata["start_index"],
            )
            for i, doc in enumerate(docs)
        ]
