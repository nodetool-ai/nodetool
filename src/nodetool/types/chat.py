from pydantic import BaseModel
from nodetool.metadata.types import Message, Task
from nodetool.models.message import MessageContent, ToolCall
from nodetool.models.workflow import Workflow


class MessageCreateRequest(BaseModel):
    thread_id: str | None = None
    user_id: str | None = None
    tool_call_id: str | None = None
    role: str = ""
    name: str = ""
    content: str | list[MessageContent] | None = None
    tool_calls: list[ToolCall] | None = None
    created_at: str | None = None
    workflow: Workflow | None = None


class MessageList(BaseModel):
    next: str | None
    messages: list[Message]


class TaskList(BaseModel):
    next: str | None
    tasks: list[Task]


class TaskCreateRequest(BaseModel):
    task_type: str
    thread_id: str
    name: str
    instructions: str
    dependencies: list[str] = []


class TaskUpdateRequest(BaseModel):
    status: str | None = None
    error: str | None = None
    result: str | None = None
    cost: float | None = None
    started_at: str | None = None
    finished_at: str | None = None
