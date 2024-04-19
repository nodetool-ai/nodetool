from typing import Any, List
from nodetool.api.types.graph import Graph
from nodetool.common.environment import Environment
from nodetool.models.asset import Asset as AssetModel
from nodetool.models.workflow import Workflow as WorkflowModel

from pydantic import BaseModel


class Workflow(BaseModel):
    id: str
    access: str
    created_at: str
    updated_at: str
    name: str
    description: str
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    graph: Graph
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None

    @classmethod
    def from_model(cls, workflow: WorkflowModel):
        thumbnail_url = None
        if workflow.thumbnail and workflow.thumbnail != "":
            asset = AssetModel.get(workflow.thumbnail)
            if asset:
                thumbnail_url = Environment.get_asset_storage().generate_presigned_url(
                    "get_object", asset.file_name
                )

        graph = workflow.get_graph()
        api_graph = workflow.get_api_graph()

        return cls(
            id=workflow.id,
            access=workflow.access,
            created_at=workflow.created_at.isoformat(),
            updated_at=workflow.updated_at.isoformat(),
            name=workflow.name,
            description=workflow.description or "",
            thumbnail=workflow.thumbnail or "",
            thumbnail_url=thumbnail_url,
            graph=api_graph,
            input_schema=graph.get_input_schema(),
            output_schema=graph.get_output_schema(),
        )


class WorkflowRequest(BaseModel):
    name: str
    description: str
    thumbnail: str | None = None
    access: str
    graph: Graph | None = None
    comfy_workflow: dict[str, Any] | None = None


class WorkflowList(BaseModel):
    next: str | None
    workflows: List[Workflow]
