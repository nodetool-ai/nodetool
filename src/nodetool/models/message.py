from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel
from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid


class ToolCall(BaseModel):
    id: str = ""
    name: str = ""
    args: dict[str, Any] = {}
    result: Any = None


class MessageTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str = ""


class ImageUrl(BaseModel):
    url: str = ""


class MessageImageContent(BaseModel):
    type: Literal["image_url"] = "image_url"
    image_url: ImageUrl = ImageUrl(url="")


MessageContent = MessageTextContent | MessageImageContent


class Message(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_messages",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "thread_id": "S"},
            "global_secondary_indexes": {
                "nodetool_message_thread_index": {
                    "thread_id": "HASH",
                },
            },
        }

    id: str = DBField(hash_key=True)
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
            condition="thread_id = :thread_id",
            values={":thread_id": thread_id},
            index="nodetool_message_thread_index",
            limit=limit,
            start_key=start_key,
            reverse=reverse,
        )
