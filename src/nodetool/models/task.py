from typing import Optional
from datetime import datetime
from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid


class Task(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_tasks",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "thread_id": "S"},
            "global_secondary_indexes": {
                "nodetool_task_thread_index": {"thread_id": "HASH"},
            },
        }

    id: str = DBField(hash_key=True)
    task_type: str = DBField(default="")
    user_id: str = DBField(default="")
    thread_id: str = DBField(default="")
    status: str = DBField(default="pending")
    name: str = DBField(default="")
    instructions: str = DBField(default="")
    dependencies: list[str] = DBField(default_factory=list)
    required_capabilities: list[str] = DBField(default_factory=list)
    started_at: datetime = DBField(default_factory=datetime.now)
    finished_at: datetime | None = DBField(default=None)
    error: str | None = DBField(default=None)
    result: str | None = DBField(default=None)
    cost: float | None = DBField(default=None)

    @classmethod
    def find(cls, user_id: str, task_id: str):
        task = cls.get(task_id)
        return task if task and task.user_id == user_id else None

    @classmethod
    def create(
        cls, user_id: str, thread_id: str, name: str, instructions: str, **kwargs
    ):
        return super().create(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            thread_id=thread_id,
            name=name,
            instructions=instructions,
            **kwargs
        )

    @classmethod
    def paginate(
        cls,
        thread_id: Optional[str] = None,
        limit: int = 10,
        start_key: Optional[str] = None,
    ):
        return cls.query(
            condition="thread_id = :thread_id",
            values={":thread_id": thread_id},
            index="nodetool_task_thread_index",
            limit=limit,
            start_key=start_key,
        )
