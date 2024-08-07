from datetime import datetime
import uuid
from typing import Any, Optional
from nodetool.models.condition_builder import Field
from nodetool.types.graph import Graph as APIGraph
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import BaseNode

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid


class Workflow(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_workflows",
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
    def find(cls, user_id: str, workflow_id: str):
        workflow = cls.get(workflow_id)
        return (
            workflow
            if workflow and (workflow.user_id == user_id or workflow.access == "public")
            else None
        )

    @classmethod
    def create(cls, user_id: str, name: str, graph: dict[str, Any], **kwargs):
        """
        Create a new image in the database.
        """

        return super().create(
            id=create_time_ordered_uuid(),
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
                condition=Field("access")
                .equals("public")
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )
        else:
            return cls.query(
                condition=Field("user_id")
                .equals(user_id)
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )

    def get_api_graph(self) -> APIGraph:
        """
        Returns the graph object for the workflow.
        """
        return APIGraph(
            nodes=self.graph["nodes"],
            edges=self.graph["edges"],
        )

    def get_graph(self) -> Graph:
        """
        Returns the graph object for the workflow.
        """
        return Graph(
            nodes=[
                BaseNode.from_dict(node, skip_errors=True)
                for node in self.graph["nodes"]
            ],
            edges=self.graph["edges"],
        )
