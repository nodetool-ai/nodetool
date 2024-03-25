from pydantic import BaseModel


from typing import Any, Literal

from nodetool.api.types.prediction import Prediction
from nodetool.metadata.types import ThreadMessage


class NodeUpdate(BaseModel):
    type: Literal["node_update"] = "node_update"
    node_id: str
    node_name: str
    status: str
    error: str | None = None
    logs: str | None = None
    result: dict[str, Any] | None = None
    properties: dict[str, Any] | None = None
    started_at: str | None = None
    completed_at: str | None = None


class MessageList(BaseModel):
    type: Literal["messages"] = "messages"
    messages: list[ThreadMessage]


class NodeProgress(BaseModel):
    type: Literal["node_progress"] = "node_progress"
    node_id: str
    progress: int
    total: int


class WorkflowUpdate(BaseModel):
    type: Literal["workflow_update"] = "workflow_update"
    result: dict[str, Any]


class Error(BaseModel):
    type: Literal["error"] = "error"
    error: str


ProcessingMessage = NodeUpdate | NodeProgress | WorkflowUpdate | Error | Prediction
