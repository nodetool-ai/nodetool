#!/usr/bin/env python

from enum import Enum
from typing import Dict, List, Optional, Union
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


router = APIRouter(prefix="/api/collections", tags=["collections"])


class IndexFile(BaseModel):
    path: str
    mime_type: str


class IndexRequest(BaseModel):
    files: List[IndexFile]


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
        metadata = {"embedding_model": req.embedding_model}
        collection = client.create_collection(name=req.name, metadata=metadata)
        return CollectionResponse(
            name=collection.name, metadata=collection.metadata, count=0
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
                    name=col.name, metadata=col.metadata or {}, count=col.count()
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
            name=collection.name, metadata=collection.metadata, count=count
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


@router.post("/{name}/index", response_model=List[IndexResponse])
async def index(
    name: str, req: IndexRequest, user: User = Depends(current_user)
) -> List[IndexResponse]:
    try:
        collection = get_collection(name)
        md = MarkItDown()
        results = []

        def convert_file(file: IndexFile):
            try:
                return (file.path, md.convert(file.path).text_content, True)
            except Exception as e:
                print(e)
                return (file.path, str(e), False)

        converted = [convert_file(file) for file in req.files]
        chunks = []
        for path, text, success in converted:
            if success:
                chunks.extend(split_document(text, path))
                results.append(IndexResponse(path=path, error=None))
            else:
                results.append(IndexResponse(path=path, error=text))

        chunks = [chunk for chunk in chunks if chunk.text]

        ids = [chunk.get_document_id() for chunk in chunks]
        docs = [chunk.text for chunk in chunks]

        collection.upsert(documents=docs, ids=ids)

        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
