#!/usr/bin/env python

from enum import Enum
from typing import Dict, List, Optional, Sequence, Union
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from nodetool.api.utils import current_user, User
from nodetool.common.chroma_client import (
    get_chroma_client,
    get_collection,
)
import chromadb
from markitdown import MarkItDown
from llama_index.readers.file.pymu_pdf import PyMuPDFReader
import pymupdf
import pymupdf4llm

from llama_index.core.node_parser import (
    SemanticSplitterNodeParser,
)
from llama_index.core.schema import Document, TextNode
from llama_index.embeddings.ollama import OllamaEmbedding

from nodetool.metadata.types import Collection, FilePath
from nodetool.models.workflow import Workflow
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.run_job_request import RunJobRequest

router = APIRouter(prefix="/api/collections", tags=["collections"])

DEFAULT_EMBEDDING_MODEL = "all-minilm:latest"


class IndexFile(BaseModel):
    path: str
    mime_type: str


class CollectionCreate(BaseModel):
    name: str
    embedding_model: str


class CollectionResponse(BaseModel):
    name: str
    count: int
    metadata: chromadb.CollectionMetadata
    workflow_name: str | None = None


class CollectionList(BaseModel):
    collections: List[CollectionResponse]
    count: int


class CollectionModify(BaseModel):
    name: str | None = None
    metadata: dict[str, str] | None = None


@router.post("/", response_model=CollectionResponse)
async def create_collection(
    req: CollectionCreate, user: User = Depends(current_user)
) -> CollectionResponse:
    """Create a new collection"""
    client = get_chroma_client()
    metadata = {
        "embedding_model": req.embedding_model,
    }
    collection = client.create_collection(name=req.name, metadata=metadata)
    return CollectionResponse(
        name=collection.name,
        metadata=collection.metadata,
        count=0,
    )


@router.get("/", response_model=CollectionList)
async def list_collections(
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    user: User = Depends(current_user),
) -> CollectionList:
    """List all collections"""
    client = get_chroma_client()
    collection_names = client.list_collections(offset=offset, limit=limit)

    collections = [client.get_collection(name) for name in collection_names]

    def get_workflow_name(metadata: dict[str, str]) -> str | None:
        if workflow_id := metadata.get("workflow"):
            workflow = Workflow.get(workflow_id)
            if workflow:
                return workflow.name
        return None

    return CollectionList(
        collections=[
            CollectionResponse(
                name=col.name,
                metadata=col.metadata or {},
                workflow_name=get_workflow_name(col.metadata or {}),
                count=col.count(),
            )
            for col in collections
        ],
        count=client.count_collections(),
    )


@router.get("/{name}", response_model=CollectionResponse)
async def get(name: str, user: User = Depends(current_user)) -> CollectionResponse:
    """Get a specific collection by name"""
    client = get_chroma_client()
    collection = client.get_collection(name=name)
    count = collection.count()
    return CollectionResponse(
        name=collection.name,
        metadata=collection.metadata,
        count=count,
    )


@router.put("/{name}")
async def update_collection(
    name: str, req: CollectionModify, user: User = Depends(current_user)
):
    """Update a collection"""
    client = get_chroma_client()
    collection = client.get_collection(name=name)
    metadata = collection.metadata.copy()
    metadata.update(req.metadata or {})

    if workflow_id := metadata.get("workflow"):
        workflow = Workflow.get(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        # Validate workflow input nodes
        graph = workflow.graph
        collection_input, file_input = find_input_nodes(graph)
        if not collection_input:
            raise HTTPException(
                status_code=400, detail="Workflow must have a CollectionInput node"
            )
        if not file_input:
            raise HTTPException(
                status_code=400,
                detail="Workflow must have a FileInput or DocumentFileInput node",
            )

    collection.modify(name=req.name, metadata=metadata)
    return CollectionResponse(
        name=collection.name,
        metadata=collection.metadata,
        count=collection.count(),
    )


@router.delete("/{name}")
async def delete_collection(name: str, user: User = Depends(current_user)):
    """Delete a collection"""
    client = get_chroma_client()
    client.delete_collection(name=name)
    return {"message": f"Collection {name} deleted successfully"}


class IndexResponse(BaseModel):
    path: str
    error: Optional[str] = None


def chunk_documents_recursive(
    documents: List[Document],
    chunk_size: int = 4096,
    chunk_overlap: int = 2048,
) -> tuple[dict[str, str], list[dict]]:
    """Split documents into chunks using LangChain's recursive character splitting.
    This method provides more semantic splitting by attempting to break at natural
    text boundaries.

    Args:
        documents: List of documents to split
        chunk_size: Maximum size of each chunk in characters
        chunk_overlap: Number of characters to overlap between chunks

    Returns:
        Tuple of (id_to_text_mapping, metadata_list)
    """
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    # Initialize the splitter with common text boundaries
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", "!", "?", " ", ""],
        length_function=len,
        add_start_index=True,
    )

    ids_docs = {}
    metadatas = []

    for doc in documents:
        # Convert to LangChain document format and split
        splits = splitter.split_text(doc.text)

        # Create document IDs and collect metadata
        for i, text in enumerate(splits):
            doc_id = f"{doc.doc_id}:{i}"
            ids_docs[doc_id] = text
            metadatas.append(doc.metadata)

    return ids_docs, metadatas


def default_ingestion_workflow(
    collection: chromadb.Collection, file_path: str, mime_type: str
) -> None:
    """Process a file and add it to the collection using the default ingestion workflow.

    Args:
        collection: ChromaDB collection to add documents to
        file_path: Path to the file to process
        mime_type: MIME type of the file
    """
    # Convert file to documents
    if mime_type == "application/pdf":
        with open(file_path, "rb") as f:
            pdf_data = f.read()
            doc = pymupdf.open(stream=pdf_data, filetype="pdf")
            md_text = pymupdf4llm.to_markdown(doc)
            documents = [Document(text=md_text, doc_id=file_path)]
    else:
        md = MarkItDown()
        documents = [
            Document(text=md.convert(file_path).text_content, doc_id=file_path)
        ]

    # Chunk documents and upsert to collection
    ids_docs, _ = chunk_documents_recursive(
        documents,
        chunk_size=4096,
        chunk_overlap=256,
    )
    collection.upsert(
        documents=list(ids_docs.values()),
        ids=list(ids_docs.keys()),
    )


def find_input_nodes(graph: dict) -> tuple[str | None, str | None]:
    """Find the collection input and file input node names from a workflow graph.

    Args:
        graph: The workflow graph to search

    Returns:
        Tuple of (collection_input_name, file_input_name) where each may be None if not found
    """
    collection_input = None
    file_input = None

    for node in graph["nodes"]:
        if node["type"] == "nodetool.input.CollectionInput":
            collection_input = node["data"]["name"]
        elif node["type"] in (
            "nodetool.input.FileInput",
            "nodetool.input.DocumentFileInput",
        ):
            file_input = node["data"]["name"]

    return collection_input, file_input


@router.post("/{name}/index", response_model=IndexResponse)
async def index(
    name: str, file: IndexFile, user: User = Depends(current_user)
) -> IndexResponse:
    collection = get_collection(name)
    if workflow_id := collection.metadata.get("workflow"):
        processing_context = ProcessingContext(
            user_id=user.id,
            auth_token=user.auth_token or "",
            workflow_id=workflow_id,
        )
        req = RunJobRequest(
            workflow_id=workflow_id,
            user_id=user.id,
            auth_token=user.auth_token or "",
        )
        workflow = await processing_context.get_workflow(workflow_id)
        req.graph = workflow.graph
        req.params = {}

        collection_input, file_input = find_input_nodes(req.graph.model_dump())
        if collection_input:
            req.params[collection_input] = Collection(name=name)
        if file_input:
            req.params[file_input] = FilePath(path=file.path)

        async for msg in run_workflow(req):
            if msg.get("type") == "job_update":
                if msg.get("status") == "completed":
                    break
                elif msg.get("status") == "failed":
                    return IndexResponse(path=file.path, error=msg.get("error"))
    else:
        default_ingestion_workflow(collection, file.path, file.mime_type)

    return IndexResponse(path=file.path, error=None)
