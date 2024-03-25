from nodetool.api.types.graph import Graph


from pydantic import BaseModel


from typing import Any, Literal


class RunJobRequest(BaseModel):
    type: Literal["run_job_request"] = "run_job_request"
    job_type: str = "workflow"
    params: Any | None = None
    workflow_id: str = ""
    user_id: str = ""
    auth_token: str = ""
    env: dict[str, Any] | None = None
    graph: Graph | None = None
