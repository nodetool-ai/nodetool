from datetime import datetime

from nodetool.metadata.types import MessageContent, ToolCall
from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from nodetool.models.condition_builder import Field


class Message(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_messages",
        }

    id: str = DBField()
    thread_id: str = DBField(default="")
    user_id: str = DBField(default="")
    tool_call_id: str | None = DBField(default=None)
    role: str = DBField(default="")
    name: str = DBField(default="")
    content: str | list[MessageContent] | None = DBField(default=None)
    tool_calls: list[ToolCall] | None = DBField(default=None)
    created_at: datetime = DBField(default_factory=datetime.now)

    @classmethod
    def create(cls, thread_id: str, user_id: str, **kwargs) -> "Message":
        return super().create(
            id=create_time_ordered_uuid(),
            thread_id=thread_id,
            user_id=user_id,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        thread_id: str | None = None,
        limit: int = 10,
        start_key: str | None = None,
        reverse: bool = False,
    ):
        return cls.query(
            condition=Field("thread_id")
            .equals(thread_id)
            .and_(Field("id").greater_than(start_key or "")),
            limit=limit,
            reverse=reverse,
        )
