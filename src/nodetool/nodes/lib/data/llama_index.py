from llama_index.core.node_parser import (
    SemanticSplitterNodeParser,
    HTMLNodeParser,
    JSONNodeParser,
)
from llama_index.core.schema import Document, TextNode
from llama_index.embeddings.ollama import OllamaEmbedding
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import LlamaModel, TextChunk
from nodetool.workflows.processing_context import ProcessingContext
from typing import List


class SentenceSplitter(BaseNode):
    """
    Splits text into chunks of a minimum length.
    text, split, sentences

    Use cases:
    - Splitting text into manageable chunks for processing
    - Creating traceable units for analysis or storage
    - Preparing text for language model processing
    """

    text: str = Field(title="Text", default="")
    min_length: int = Field(title="Minimum Length", default=10)
    source_id: str = Field(title="Source ID", default="")
    chunk_size: int = Field(title="Chunk Size", default=1000)
    chunk_overlap: int = Field(title="Chunk Overlap", default=200)

    @classmethod
    def get_title(cls):
        return "Split Sentences"

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_core.documents import Document

        assert self.source_id, "document_id is required"

        separators = ["\n\n", "\n", ".", "?", "!", " ", ""]

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=separators,
            length_function=len,
            is_separator_regex=False,
            add_start_index=True,
        )

        docs = splitter.split_documents([Document(page_content=self.text)])

        return [
            TextChunk(
                text=doc.page_content,
                source_id=self.source_id,
                start_index=doc.metadata["start_index"],
            )
            for doc in docs
        ]


class SemanticSplitter(BaseNode):
    """
    Split text semantically.
    chroma, embedding, collection, RAG, index, text, markdown, semantic
    """

    embed_model: LlamaModel = Field(
        default=LlamaModel(),
        description="Embedding model to use",
    )

    document_id: str = Field(
        default="", description="Document ID to associate with the text content"
    )
    text: str = Field(default="", description="Text content to split")
    buffer_size: int = Field(
        default=1, description="Buffer size for semantic splitting"
    )
    threshold: int = Field(
        default=5, description="Breakpoint percentile threshold for semantic splitting"
    )

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        assert self.embed_model.repo_id, "embed_model is required"

        splitter = SemanticSplitterNodeParser(
            buffer_size=self.buffer_size,
            breakpoint_percentile_threshold=self.threshold,
            embed_model=OllamaEmbedding(model_name=self.embed_model.repo_id),
        )

        documents = [Document(text=self.text, doc_id=self.document_id)]

        # Split documents semantically
        nodes = splitter.build_semantic_nodes_from_documents(documents)

        # Convert nodes to TextChunks
        return [
            TextChunk(
                text=node.text,
                source_id=self.document_id,
                start_index=i,
            )
            for i, node in enumerate(nodes)
            if isinstance(node, TextNode)
        ]


class HTMLSplitter(BaseNode):
    """
    Split HTML content into semantic chunks based on HTML tags.
    html, text, semantic, tags, parsing
    """

    document_id: str = Field(
        default="", description="Document ID to associate with the HTML content"
    )
    text: str = Field(default="", description="HTML content to split")

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        parser = HTMLNodeParser(
            tags=[
                "p",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "li",
                "b",
                "i",
                "u",
                "section",
            ],
            include_metadata=False,
            include_prev_next_rel=False,
        )

        doc = Document(text=self.text, doc_id=self.document_id)

        nodes = parser.get_nodes_from_node(doc)

        return [
            TextChunk(
                text=node.text,
                source_id=self.document_id,
                start_index=i,
            )
            for i, node in enumerate(nodes)
        ]


class JSONSplitter(BaseNode):
    """
    Split JSON content into semantic chunks.
    json, parsing, semantic, structured
    """

    document_id: str = Field(
        default="", description="Document ID to associate with the JSON content"
    )
    text: str = Field(default="", description="JSON content to split")
    include_metadata: bool = Field(
        default=True, description="Whether to include metadata in nodes"
    )
    include_prev_next_rel: bool = Field(
        default=True, description="Whether to include prev/next relationships"
    )

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        parser = JSONNodeParser(
            include_metadata=self.include_metadata,
            include_prev_next_rel=self.include_prev_next_rel,
        )

        doc = Document(text=self.text, doc_id=self.document_id)

        nodes = parser.get_nodes_from_node(doc)

        return [
            TextChunk(
                text=node.text,
                source_id=self.document_id,
                start_index=i,
            )
            for i, node in enumerate(nodes)
        ]
