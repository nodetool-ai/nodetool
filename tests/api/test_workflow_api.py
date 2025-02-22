from fastapi.testclient import TestClient
from nodetool.types.workflow import WorkflowRequest, WorkflowList
from nodetool.types.graph import Edge, Graph as APIGraph, Node
from nodetool.types.workflow import (
    WorkflowList,
)
from nodetool.models.user import User
from nodetool.models.workflow import Workflow


def test_create_workflow(
    client: TestClient, workflow: Workflow, headers: dict[str, str], user: User
):
    params = {
        "name": "Test Workflow",
        "graph": workflow.graph,
        "description": "Test Workflow Description",
        "thumbnail": "Test Workflow Thumbnail",
        "access": "private",
    }
    request = WorkflowRequest(**params)
    json = request.model_dump()
    response = client.post("/api/workflows/", json=json, headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Test Workflow"

    w = Workflow.get(response.json()["id"])
    assert w is not None
    assert w.name == "Test Workflow"
    assert w.user_id == user.id
    assert w.graph == workflow.graph


def test_get_workflows(client: TestClient, workflow: Workflow, headers: dict[str, str]):
    workflow.save()
    response = client.get("/api/workflows/", headers=headers)
    assert response.status_code == 200
    workflow_list = WorkflowList(**response.json())
    assert len(workflow_list.workflows) == 1
    assert workflow_list.workflows[0].id == workflow.id


def test_get_workflow(client: TestClient, workflow: Workflow, headers: dict[str, str]):
    workflow.save()
    response = client.get(f"/api/workflows/{workflow.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == workflow.id
    assert response.json()["input_schema"] == {
        "type": "object",
        "properties": {
            "in1": {
                "type": "number",
                "default": 10,
                "minimum": 0,
                "maximum": 100,
                "label": "",
            },
        },
        "required": ["in1"],
    }


def test_get_public_workflow(
    client: TestClient, workflow: Workflow, headers: dict[str, str]
):
    workflow.save()
    response = client.get(f"/api/workflows/public/{workflow.id}", headers=headers)
    assert response.status_code == 404
    workflow.access = "public"
    workflow.save()
    response = client.get(f"/api/workflows/public/{workflow.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == workflow.id
    assert response.json()["input_schema"] == {
        "type": "object",
        "properties": {
            "in1": {
                "type": "number",
                "default": 10,
                "minimum": 0,
                "maximum": 100,
                "label": "",
            },
        },
        "required": ["in1"],
    }


def test_index(client: TestClient, workflow: Workflow, headers: dict[str, str]):
    workflow.save()
    response = client.get("/api/workflows/", headers=headers)
    assert response.status_code == 200
    workflow_list = WorkflowList(**response.json())
    assert len(workflow_list.workflows) == 1
    assert workflow_list.workflows[0].id == workflow.id


def test_get_public_workflows(
    client: TestClient, workflow: Workflow, headers: dict[str, str]
):
    workflow.save()
    response = client.get("/api/workflows/public", headers=headers)
    assert response.status_code == 200
    workflow_list = WorkflowList(**response.json())
    assert len(workflow_list.workflows) == 0

    workflow.access = "public"
    workflow.save()
    response = client.get("/api/workflows/public", headers=headers)
    assert response.status_code == 200
    workflow_list = WorkflowList(**response.json())
    assert len(workflow_list.workflows) == 1


def test_update_workflow(
    client: TestClient, workflow: Workflow, headers: dict[str, str]
):
    request = WorkflowRequest(
        name="Updated Workflow",
        description="Updated Workflow Description",
        thumbnail="Updated Workflow Thumbnail",
        access="public",
        graph=APIGraph(
            nodes=[Node(**n) for n in workflow.graph["nodes"]],
            edges=[Edge(**e) for e in workflow.graph["edges"]],
        ),
    )
    response = client.put(
        f"/api/workflows/{workflow.id}", json=request.model_dump(), headers=headers
    )
    assert response.status_code == 200
    assert "id" in response.json()

    saved_workflow = Workflow.get(response.json()["id"])

    assert saved_workflow is not None
    assert saved_workflow.name == "Updated Workflow"


def test_delete_workflow(
    client: TestClient, workflow: Workflow, headers: dict[str, str]
):
    workflow.save()
    response = client.delete(f"/api/workflows/{workflow.id}", headers=headers)
    assert response.status_code == 200


def test_run_workflow(client: TestClient, workflow: Workflow, headers: dict[str, str]):
    workflow.save()

    response = client.post(
        f"/api/workflows/{workflow.id}/run", json={}, headers=headers
    )
    assert response.status_code == 200

    # Test streaming response
    response = client.post(
        f"/api/workflows/{workflow.id}/run",
        json={},
        params={"stream": True},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/x-ndjson"
