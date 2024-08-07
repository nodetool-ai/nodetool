import json
import os

import pytest
from nodetool.types.graph import Edge
from nodetool.types.graph import Graph
from nodetool.models.job import Job
from nodetool.workflows.run_job_request import RunJobRequest
from tests.conftest import make_job
from fastapi.testclient import TestClient
from nodetool.models.user import User
from nodetool.models.workflow import Workflow
from nodetool.nodes.nodetool.input import IntegerInput
from nodetool.nodes.nodetool.math import Add
from nodetool.nodes.nodetool.output import IntegerOutput

current_dir = os.path.dirname(os.path.realpath(__file__))
test_file = os.path.join(current_dir, "test.jpg")


def test_get(client: TestClient, headers: dict[str, str], user: User):
    job = make_job(user)
    job.save()
    response = client.get(f"/api/jobs/{job.id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert data["id"] == job.id
    assert data["status"] == job.status


def test_put(client: TestClient, headers: dict[str, str], user: User):
    job = make_job(user)
    job.save()
    response = client.put(
        f"/api/jobs/{job.id}", headers=headers, json={"status": "completed"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert data["id"] == job.id
    assert data["status"] == "completed"

    job = Job.get(job.id)
    assert job is not None
    assert job.status == "completed"


def test_index(client: TestClient, headers: dict[str, str], user: User):
    make_job(user)
    make_job(user)
    response = client.get("/api/jobs", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert len(data["jobs"]) == 2


def test_index_limit(client: TestClient, headers: dict[str, str], user: User):
    make_job(user)
    make_job(user)
    response = client.get("/api/jobs", params={"page_size": 1}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert len(data["jobs"]) == 1


@pytest.mark.asyncio
async def test_create(
    client: TestClient,
    workflow: Workflow,
    user: User,
    headers: dict[str, str],
):

    req = RunJobRequest(
        workflow_id=workflow.id,
        auth_token=str(user.auth_token),
        graph=Graph(nodes=[], edges=[]),
        params={},
    )

    response = client.post(
        "/api/jobs/",
        json=req.model_dump(),
        headers=headers,
    )
    assert response.status_code == 200
    job = response.json()

    assert job["status"] == "running"
    assert job["workflow_id"] == workflow.id
    assert job["user_id"] == user.id
    assert job["graph"] == {"nodes": [], "edges": []}
