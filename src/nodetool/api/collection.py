#!/usr/bin/env python

from enum import Enum
from typing import Dict, List, Optional, Sequence, Union
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from nodetool.api.utils import current_user, User
from nodetool.common.chroma_client import (
    get_chroma_client,
    get_collection,
    split_document,
)
import chromadb
from markitdown import MarkItDown

from llama_index.core.node_parser import (
    SemanticSplitterNodeParser,
)
from llama_index.core.schema import Document, TextNode
from llama_index.embeddings.ollama import OllamaEmbedding

router = APIRouter(prefix="/api/collections", tags=["collections"])

DEFAULT_BUFFER_SIZE = 10
DEFAULT_BREAKPOINT_THRESHOLD = 95
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


class CollectionList(BaseModel):
    collections: List[CollectionResponse]
    count: int


class CollectionModify(BaseModel):
    name: Optional[str] = None
    metadata: Optional[chromadb.CollectionMetadata] = None


@router.post("/", response_model=CollectionResponse)
async def create_collection(
    req: CollectionCreate, user: User = Depends(current_user)
) -> CollectionResponse:
    """Create a new collection"""
    try:
        client = get_chroma_client()
        metadata = {
            "embedding_model": req.embedding_model,
            "breakpoint_percentile_threshold": DEFAULT_BREAKPOINT_THRESHOLD,
            "buffer_size": DEFAULT_BUFFER_SIZE,
        }
        collection = client.create_collection(name=req.name, metadata=metadata)
        return CollectionResponse(
            name=collection.name,
            metadata=collection.metadata,
            count=0,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=CollectionList)
async def list_collections(
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    user: User = Depends(current_user),
) -> CollectionList:
    """List all collections"""
    try:
        client = get_chroma_client()
        collections = client.list_collections(offset=offset, limit=limit)
        return CollectionList(
            collections=[
                CollectionResponse(
                    name=col.name,
                    metadata=col.metadata or {},
                    count=col.count(),
                )
                for col in collections
            ],
            count=client.count_collections(),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}", response_model=CollectionResponse)
async def get(name: str, user: User = Depends(current_user)) -> CollectionResponse:
    """Get a specific collection by name"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name=name)
        count = collection.count()
        return CollectionResponse(
            name=collection.name,
            metadata=collection.metadata,
            count=count,
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Collection {name} not found")


@router.delete("/{name}")
async def delete_collection(name: str, user: User = Depends(current_user)):
    """Delete a collection"""
    try:
        client = get_chroma_client()
        client.delete_collection(name=name)
        return {"message": f"Collection {name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Collection {name} not found")


class IndexResponse(BaseModel):
    path: str
    error: Optional[str] = None


def recursive_text_chunking(content: Sequence[tuple[str, str, bool]]):
    chunks = []
    results = []
    for path, text, success in content:
        if success:
            chunks.extend(split_document(text, path))
            results.append(IndexResponse(path=path, error=None))
        else:
            results.append(IndexResponse(path=path, error=text))

    return [chunk for chunk in chunks if chunk.text], results


@router.post("/{name}/index", response_model=IndexResponse)
async def index(
    name: str, file: IndexFile, user: User = Depends(current_user)
) -> IndexResponse:
    try:
        collection = get_collection(name)
        md = MarkItDown()
        splitter = SemanticSplitterNodeParser(
            embed_model=OllamaEmbedding(
                model_name=collection.metadata.get(
                    "embed_model", DEFAULT_EMBEDDING_MODEL
                )
            ),
            buffer_size=collection.metadata.get("buffer_size", DEFAULT_BUFFER_SIZE),
            breakpoint_percentile_threshold=collection.metadata.get(
                "breakpoint_percentile_threshold", DEFAULT_BREAKPOINT_THRESHOLD
            ),
        )

        try:
            document = Document(
                text=md.convert(file.path).text_content, doc_id=file.path
            )
            nodes = splitter.build_semantic_nodes_from_documents([document])
            ids_docs = {
                f"{file.path}:{i}": node.text
                for i, node in enumerate(nodes)
                if isinstance(node, TextNode)
            }
            collection.upsert(
                documents=list(ids_docs.values()), ids=list(ids_docs.keys())
            )
        except Exception as e:
            return IndexResponse(path=file.path, error=str(e))

        return IndexResponse(path=file.path, error=None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
