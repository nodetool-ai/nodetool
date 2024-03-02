import datetime
from typing import Any, Literal, Optional, List
from pydantic import BaseModel
from genflow.api.models.graph import Graph
from genflow.common.environment import Environment
from genflow.models.job import Job
from genflow.models.assistant import Assistant as AssistantModel
from genflow.models.asset import Asset as AssetModel
from genflow.models.prediction import Prediction as PredictionModel
from genflow.models.workflow import Workflow as WorkflowModel
from openai.types.beta.threads import Run as OpenAIRun
from openai.types.beta.threads.run import RequiredAction
from pydantic import BaseModel, Field


# Needed for react native
class S3FormFields(BaseModel):
    key: str
    x_amz_algorithm: str = Field(alias="x-amz-algorithm")
    x_amz_credential: str = Field(alias="x-amz-credential")
    x_amz_date: str = Field(alias="x-amz-date")
    policy: str
    x_amz_signature: str = Field(alias="x-amz-signature")


# Needed for react native
class S3PostForm(BaseModel):
    url: str
    fields: S3FormFields


class XYPosition(BaseModel):
    x: float
    y: float


class WorkflowRequest(BaseModel):
    name: str
    description: str
    thumbnail: str | None = None
    access: str
    graph: Graph | None = None
    comfy_workflow: dict[str, Any] | None = None


class Workflow(BaseModel):
    id: str
    access: str
    created_at: str
    updated_at: str
    workflow_type: str | None = "workflow"
    name: str
    description: str
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    graph: Graph

    @classmethod
    def from_model(cls, workflow: WorkflowModel):
        thumbnail_url = None
        if workflow.thumbnail and workflow.thumbnail != "":
            asset = AssetModel.get(workflow.thumbnail)
            if asset:
                thumbnail_url = (
                    Environment.get_asset_storage().generate_presigned_url(
                        "get_object", asset.file_name
                    )
                )

        return cls(
            id=workflow.id,
            access=workflow.access,
            workflow_type=workflow.workflow_type,
            created_at=workflow.created_at.isoformat(),
            updated_at=workflow.updated_at.isoformat(),
            name=workflow.name,
            description=workflow.description or "",
            thumbnail=workflow.thumbnail or "",
            thumbnail_url=thumbnail_url,
            graph=Graph(
                nodes=workflow.graph["nodes"],
                edges=workflow.graph["edges"],
            ),
        )


class WorkflowList(BaseModel):
    next: Optional[str]
    workflows: List[Workflow]



class Prediction(BaseModel):
    """
    A prediction made by a remote model.
    """

    type: Literal["prediction"] = "prediction"

    id: str
    node_id: str
    version: Optional[str]
    node_type: Optional[str]
    status: str
    input: Optional[dict[str, Any]]
    output: Optional[Any]
    logs: Optional[str]
    error: Optional[str]
    metrics: Optional[dict[str, Any]]
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]

    @classmethod
    def from_model(cls, prediction: PredictionModel):
        return cls(
            id=prediction.id,
            node_id=prediction.node_id,
            node_type=prediction.node_type,
            version=prediction.version,
            status=prediction.status,
            input=prediction.input,
            output=prediction.output,
            logs=prediction.logs,
            error=prediction.error,
            metrics=prediction.metrics,
            created_at=(
                prediction.created_at.isoformat() if prediction.created_at else None
            ),
            started_at=(
                prediction.started_at.isoformat() if prediction.started_at else None
            ),
            completed_at=(
                prediction.completed_at.isoformat() if prediction.completed_at else None
            ),
        )


class PredictionList(BaseModel):
    next: Optional[str]
    predictions: List[Prediction]


class Assistant(BaseModel):
    """
    An assistant is a tool that can be used to perform a specific task.
    """

    id: str
    created_at: str
    description: Optional[str]
    instructions: Optional[str]
    workflows: Optional[set[str]]
    nodes: Optional[set[str]]
    assets: Optional[set[str]]
    name: str

    @classmethod
    def from_model(cls, assistant: AssistantModel):
        return cls(
            id=assistant.id,
            created_at=assistant.created_at,
            description=assistant.description,
            instructions=assistant.instructions,
            name=assistant.name,
            workflows=assistant.workflows,
            assets=assistant.assets,
            nodes=assistant.nodes,
        )


class AssistantCreateRequest(BaseModel):
    """
    The request body for creating an assistant.
    """

    name: str
    description: Optional[str]
    instructions: Optional[str]


class AssistantUpdateRequest(BaseModel):
    """
    The request body for updating an assistant.
    """

    name: Optional[str]
    description: Optional[str]
    instructions: Optional[str]
    workflows: Optional[set[str]]
    nodes: Optional[set[str]]
    assets: Optional[set[str]]


class AssistantList(BaseModel):
    next: str | None
    assistants: List[Assistant]


class JobRequest(BaseModel):
    workflow_id: str
    params: dict


class JobUpdate(BaseModel):
    type: Literal["job_update"] = "job_update"
    status: str
    error: str | None = None


class JobList(BaseModel):
    next: Optional[str]
    jobs: List[Job]


class AuthRequest(BaseModel):
    token: str


class Run(BaseModel):
    type: Literal["run"] = "run"
    id: str
    status: Literal[
        "queued",
        "in_progress",
        "requires_action",
        "cancelling",
        "cancelled",
        "failed",
        "completed",
        "expired",
    ]
    thread_id: str
    started_at: str | None
    required_action: RequiredAction | None

    @classmethod
    def from_openai(cls, run: OpenAIRun):
        return cls(
            id=run.id,
            status=run.status,
            thread_id=run.thread_id,
            required_action=run.required_action,
            started_at=(
                datetime.datetime.fromtimestamp(run.started_at).isoformat()
                if run.started_at
                else None
            ),
        )
