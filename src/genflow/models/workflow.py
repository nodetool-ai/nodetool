from datetime import datetime
import uuid
from typing import Any, Optional
from genflow.workflows.graph import Graph
from genflow.workflows.genflow_node import GenflowNode

from genflow.models.base_model import DBModel, DBField


class Workflow(DBModel):

    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_workflows",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {
                "id": "S",
                "user_id": "S",
                "assistant_id": "S",
                "access": "S",
                "updated_at": "S",
            },
            "global_secondary_indexes": {
                "genflow_workflow_user_index": {"user_id": "HASH"},
                "genflow_workflow_assistant_index": {"assistant_id": "HASH"},
                "genflow_workflow_access_index": {
                    "access": "HASH",
                    "updated_at": "RANGE",
                },
            },
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    access: str = DBField(default="private")
    created_at: datetime = DBField(default_factory=datetime.now)
    updated_at: datetime = DBField(default_factory=datetime.now)
    name: str = DBField(default="")
    description: str | None = DBField(default="")
    thumbnail: str | None = DBField(default=None)
    graph: dict = DBField(default_factory=dict)
    workflow_type: str | None = DBField(default=None)

    def before_save(self):
        self.updated_at = datetime.now()

    @classmethod
    def from_dict(cls, data: dict[str, Any]):
        """
        Create a new Workflow object from a dictionary.
        """
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            access=data["access"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            name=data["name"],
            description=data["description"],
            thumbnail=data["thumbnail"],
            graph=data["graph"],
        )

    @classmethod
    def create(cls, user_id: str, name: str, graph: dict[str, Any], **kwargs):
        """
        Create a new image in the database.
        """

        return super().create(
            id=uuid.uuid4().hex,
            user_id=user_id,
            name=name,
            graph=graph,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        user_id: str | None = None,
        limit: int = 100,
        start_key: Optional[str] = None,
    ):
        if user_id is None:
            return cls.query(
                condition="access = :public",
                values={":public": "public"},
                index="genflow_workflow_access_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            return cls.query(
                condition="user_id = :user_id",
                values={":user_id": user_id},
                index="genflow_workflow_user_index",
                limit=limit,
                start_key=start_key,
            )

    def get_graph(self) -> Graph:
        """
        Returns the graph object for the workflow.
        """
        return Graph(
            nodes=[GenflowNode.from_dict(node) for node in self.graph["nodes"]],
            edges=self.graph["edges"],
        )
