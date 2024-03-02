#!/usr/bin/env python

from fastapi import APIRouter
from genflow.api.models.models import (
    JobUpdate,
    Run,
)
from genflow.api.models.models import Prediction
from genflow.metadata.node_metadata import NodeMetadata
from genflow.metadata.types import AssetRef
from genflow.metadata.types import AudioRef
from genflow.metadata.types import DataFrame
from genflow.metadata.types import FolderRef
from genflow.metadata.types import ImageRef
from genflow.metadata.types import ModelRef
from genflow.metadata.types import Tensor
from genflow.metadata.types import TextRef
from genflow.metadata.types import VideoRef
from genflow.workflows.genflow_node import get_registered_node_classes
from genflow.workflows.types import (
    WorkflowUpdate,
)

from genflow.common.environment import Environment
from genflow.metadata.types import (
    AssistantRef,
    FileRef,
    Thread,
    ThreadMessage,
)
from genflow.workflows.types import MessageList, NodeProgress, NodeUpdate


log = Environment.get_logger()
router = APIRouter(prefix="/api/nodes", tags=["nodes"])


# This is a dummy type that contains all property types and Websocket types.
UnionType = (
    AssetRef
    | AudioRef
    | DataFrame
    | FolderRef
    | ImageRef
    | Tensor
    | VideoRef
    | AssistantRef
    | FileRef
    | Thread
    | ThreadMessage
    | ModelRef
    | TextRef
    | MessageList
    | Prediction
    | Run
    | JobUpdate
    | NodeUpdate
    | NodeProgress
    | WorkflowUpdate
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
    import genflow.nodes

    return [node_class.metadata() for node_class in get_registered_node_classes()]
