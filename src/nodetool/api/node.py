#!/usr/bin/env python

from fastapi import APIRouter
from nodetool.types.job import (
    JobUpdate,
)
from nodetool.types.prediction import Prediction
from nodetool.metadata.node_metadata import NodeMetadata
from nodetool.metadata.types import (
    AssetRef,
    NodeRef,
    WorkflowRef,
    AudioRef,
    DataframeRef,
    FolderRef,
    ImageRef,
    ModelRef,
    Tensor,
    TextRef,
    VideoRef,
)
from nodetool.workflows.base_node import get_registered_node_classes
from nodetool.common.environment import Environment
from nodetool.workflows.types import NodeProgress, NodeUpdate

log = Environment.get_logger()
router = APIRouter(prefix="/api/nodes", tags=["nodes"])


# This is a dummy type that contains all property types and Websocket types.
UnionType = (
    AssetRef
    | AudioRef
    | DataframeRef
    | FolderRef
    | ImageRef
    | Tensor
    | VideoRef
    | ModelRef
    | TextRef
    | WorkflowRef
    | NodeRef
    | Prediction
    | JobUpdate
    | NodeUpdate
    | NodeProgress
    | dict
)


@router.get("/dummy")
async def dummy() -> UnionType:
    """
    Returns a dummy node.
    """
    return {"hello": "world"}


@router.get("/metadata")
async def metadata() -> list[NodeMetadata]:
    """
    Returns a list of all node metadata.
    """
    import nodetool.nodes

    return [node_class.metadata() for node_class in get_registered_node_classes()]
