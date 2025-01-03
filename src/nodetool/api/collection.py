#!/usr/bin/env python

from enum import Enum
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from nodetool.api.utils import current_user, User
from nodetool.common.chroma_client import get_chroma_client
from nodetool.common.environment import Environment
import chromadb

router = APIRouter(prefix="/api/collections", tags=["collections"])


class EmbeddingModel(str, Enum):
    OPENCLIP = "openclip"
    ALL_MINI_LM_L6_V2 = "all-MiniLM-L6-v2"
    ALL_MINI_LM_L12_V2 = "all-MiniLM-L12-v2"
    ALL_MINI_LM_L12_V3 = "all-MiniLM-L12-v3"
    ALL_MINI_LM_L12_V3_HFP = "all-MiniLM-L12-v3-HFP"


class CollectionCreate(BaseModel):
    name: str
    embedding_model: EmbeddingModel = EmbeddingModel.ALL_MINI_LM_L6_V2


class CollectionResponse(BaseModel):
    name: str
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
            "embedding_model": req.embedding_model.value,
        }
        collection = client.create_collection(name=req.name, metadata=metadata)
        return CollectionResponse(name=collection.name, metadata=collection.metadata)
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
                CollectionResponse(name=col.name, metadata=col.metadata or {})
                for col in collections
            ],
            count=client.count_collections(),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}", response_model=CollectionResponse)
async def get_collection(
    name: str, user: User = Depends(current_user)
) -> CollectionResponse:
    """Get a specific collection by name"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name=name)
        return CollectionResponse(name=collection.name, metadata=collection.metadata)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Collection {name} not found")


@router.put("/{name}", response_model=CollectionResponse)
async def modify_collection(
    name: str, req: CollectionModify, user: User = Depends(current_user)
) -> CollectionResponse:
    """Modify an existing collection"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name=name)

        if req.name or req.metadata:
            collection.modify(name=req.name, metadata=req.metadata)

        return CollectionResponse(name=collection.name, metadata=collection.metadata)
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


@router.get("/{name}/count")
async def count_documents(
    name: str, user: User = Depends(current_user)
) -> Dict[str, int]:
    """Count documents in a collection"""
    try:
        client = get_chroma_client()
        collection = client.get_collection(name=name)
        count = collection.count()
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Collection {name} not found")
