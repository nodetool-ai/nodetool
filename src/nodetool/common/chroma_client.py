import chromadb
from chromadb.config import Settings, DEFAULT_DATABASE, DEFAULT_TENANT
from urllib.parse import urlparse
from nodetool.common.environment import Environment
from chromadb.utils.embedding_functions.open_clip_embedding_function import (
    OpenCLIPEmbeddingFunction,
)
from chromadb.utils.embedding_functions.sentence_transformer_embedding_function import (
    SentenceTransformerEmbeddingFunction,
)
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
from langchain_core.documents import Document
from typing import List, Dict, Any

from nodetool.metadata.types import TextChunk


def get_chroma_client(
    user_id: str | None = None,
):
    """
    Get a ChromaDB client instance.

    Args:
        user_id (str | None): User ID for tenant creation. Required for remote connections.
        existing_client (ClientAPI | None): Existing ChromaDB client to reuse if provided.

    Returns:
        ClientAPI: ChromaDB client instance
    """
    url = Environment.get_chroma_url()
    token = Environment.get_chroma_token()
    log = Environment.get_logger()

    if url is not None:
        parsed_url = urlparse(url)

        # Only create tenant if user_id is provided
        if user_id:
            admin = chromadb.AdminClient(
                settings=Settings(
                    chroma_api_impl="chromadb.api.fastapi.FastAPI",
                    chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                    chroma_client_auth_credentials=token,
                    chroma_server_host=parsed_url.hostname,
                    chroma_server_http_port=parsed_url.port,
                ),
            )
            tenant = f"tenant_{user_id}"
            try:
                admin.get_tenant(tenant)
            except Exception as e:
                log.info(f"Creating tenant {tenant}")
                admin.create_tenant(tenant)
                log.info(f"Creating database {DEFAULT_DATABASE}")
                admin.create_database(DEFAULT_DATABASE, tenant)

        return chromadb.HttpClient(
            host=parsed_url.hostname,
            port=parsed_url.port,
            settings=Settings(
                chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                chroma_client_auth_credentials=token,
            ),
            tenant=f"tenant_{user_id}" if user_id else DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )
    else:
        return chromadb.PersistentClient(
            path=Environment.get_chroma_path(),
            tenant=DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )


def get_collection(name: str) -> chromadb.Collection:
    """
    Get a collection by name.
    Automatically handles embedding model selection.
    Raises an error if the collection doesn't have embedding model information.

    Args:
        name: The name of the collection.

    Returns:
        The collection.
    """
    client = get_chroma_client()
    collection = client.get_collection(name=name)

    # Get embedding model from collection metadata
    if not collection.metadata or "embedding_model" not in collection.metadata:
        raise ValueError("Collection doesn't have embedding model information")

    if collection.metadata["embedding_model"] == "openclip":
        embedding_function = OpenCLIPEmbeddingFunction()
    else:
        embedding_function = SentenceTransformerEmbeddingFunction(
            model_name=collection.metadata["embedding_model"]
        )

    return client.get_collection(
        name=name, embedding_function=embedding_function  # type: ignore
    )


DEFAULT_SEPARATORS = [
    "\n\n",
    "\n",
    ".",
]


def split_document(
    text: str,
    source_id: str,
    chunk_size: int = 2000,
    chunk_overlap: int = 1000,
    separators: List[str] = DEFAULT_SEPARATORS,
) -> List[TextChunk]:
    """
    Split text using markdown headers and/or chunk size.

    Args:
        text: Text content to split
        chunk_size: Optional size for further chunking
        chunk_overlap: Overlap between chunks when using chunk_size
        separators: List of separators to use for splitting, in order of preference

    Returns:
        List of dictionaries containing split text and metadata
    """
    splits = []

    # Split by headers if specified
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        length_function=len,
        is_separator_regex=False,
        add_start_index=True,
    )

    splits = splitter.split_documents([Document(page_content=text)])

    # Normalize output format
    return [
        TextChunk(
            text=doc.page_content,
            source_id=source_id,
            start_index=doc.metadata["start_index"],
        )
        for doc in splits
    ]
