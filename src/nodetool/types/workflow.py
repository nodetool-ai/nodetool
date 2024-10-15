from typing import Any, List
from nodetool.types.graph import Graph, get_input_schema, get_output_schema
from nodetool.common.environment import Environment
from nodetool.models.workflow import Workflow as WorkflowModel

from pydantic import BaseModel


def find_thumbnail(workflow: WorkflowModel) -> str | None:
    if workflow.thumbnail:
        return Environment.get_asset_storage().get_url(workflow.thumbnail)
    else:
        return None


class Workflow(BaseModel):
    id: str
    access: str
    created_at: str
    updated_at: str
    name: str
    description: str
    tags: list[str] | None = None
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    graph: Graph
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None

    @classmethod
    def from_model(cls, workflow: WorkflowModel):
        api_graph = workflow.get_api_graph()

        return cls(
            id=workflow.id,
            access=workflow.access,
            created_at=workflow.created_at.isoformat(),
            updated_at=workflow.updated_at.isoformat(),
            name=workflow.name,
            tags=workflow.tags,
            description=workflow.description or "",
            thumbnail=workflow.thumbnail or "",
            thumbnail_url=find_thumbnail(workflow),
            graph=api_graph,
            input_schema=get_input_schema(api_graph),
            output_schema=get_output_schema(api_graph),
        )


class WorkflowRequest(BaseModel):
    name: str
    tags: list[str] | None = None
    description: str | None = None
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    access: str
    graph: Graph | None = None
    comfy_workflow: dict[str, Any] | None = None


class WorkflowList(BaseModel):
    next: str | None
    workflows: List[Workflow]
