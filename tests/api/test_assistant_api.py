from unittest import mock
from fastapi.testclient import TestClient
from tests.conftest import make_image
from genflow.models.user import User
from genflow.models.assistant import Assistant
from genflow.models.workflow import Workflow
from unittest.mock import AsyncMock, MagicMock
from openai.types.beta.assistant import Assistant as OpenAIAssistant

from genflow.nodes.genflow.input import StringInputNode
from genflow.nodes.genflow.output import StringOutputNode


def test_create_assistant(client: TestClient, headers: dict[str, str], user: User):
    params = {
        "user_id": user.id,
        "name": "Test Assistant",
        "description": "Test Assistant Description",
        "instructions": "Test Assistant Instructions",
    }
    with mock.patch(
        "genflow.api.assistant.Environment.get_openai_client", new_callable=MagicMock
    ) as mock_client:
        mock_client.return_value.beta.assistants.create = AsyncMock(
            return_value=OpenAIAssistant(
                id="test-assistant-id",
                name="Test Assistant",
                description="Test Assistant Description",
                instructions="Test Assistant Instructions",
                created_at=0,
                tools=[],
                file_ids=[],
                metadata={},
                model="gpt4",
                object="assistant",
            )
        )

        response = client.post("/api/assistants/", json=params, headers=headers)
        assert response.status_code == 200
        assert response.json()["name"] == "Test Assistant"

        a = Assistant.get(response.json()["id"])
        assert a is not None
        assert a.name == "Test Assistant"
        assert a.user_id == user.id
        assert a.description == "Test Assistant Description"
        assert a.instructions == "Test Assistant Instructions"


def test_get_assistants(
    client: TestClient, assistant: Assistant, headers: dict[str, str]
):
    assistant.save()
    response = client.get("/api/assistants/", headers=headers)
    assert response.status_code == 200


def test_get_assistant(
    client: TestClient, assistant: Assistant, headers: dict[str, str]
):
    assistant.save()
    response = client.get(f"/api/assistants/{assistant.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == assistant.id


def test_update_assistant(
    client: TestClient,
    user: User,
    assistant: Assistant,
    headers: dict[str, str],
):
    image = make_image(user)
    graph = {
        "nodes": [
            {
                "id": "1",
                "type": StringInputNode.get_node_type(),
                "data": {"properties": {"value": ""}},
            },
            {
                "id": "2",
                "type": StringOutputNode.get_node_type(),
                "data": {"properties": {"value": ""}},
            },
        ],
        "edges": [
            {
                "id": "1",
                "source": "1",
                "target": "2",
                "sourceHandle": "output",
                "targetHandle": "input",
                "ui_properties": {},
            }
        ],
    }

    workflow = Workflow.create(user_id=user.id, name="Test Workflow", graph=graph)

    request = {
        "name": "Updated Assistant",
        "description": "Updated Assistant Description",
        "instructions": "Updated Assistant Instructions",
        "workflows": [workflow.id],
        "nodes": ["string"],
        "assets": [image.id],
    }

    response = client.put(
        f"/api/assistants/{assistant.id}", json=request, headers=headers
    )
    assert response.status_code == 200
    assert "id" in response.json()

    saved_assistant = Assistant.get(response.json()["id"])

    assert saved_assistant is not None
    assert saved_assistant.name == "Updated Assistant"
    assert saved_assistant.description == "Updated Assistant Description"
    assert saved_assistant.instructions == "Updated Assistant Instructions"
    assert saved_assistant.workflows == {workflow.id}
    assert saved_assistant.nodes == {"string"}


def test_delete_assistant(
    client: TestClient, assistant: Assistant, headers: dict[str, str]
):
    with mock.patch(
        "genflow.api.assistant.Environment.get_openai_client", new_callable=MagicMock
    ) as mock_client:
        mock_client.return_value.beta.assistants.delete = AsyncMock()
        response = client.delete(f"/api/assistants/{assistant.id}", headers=headers)
        assert response.status_code == 200
        assert Assistant.get(assistant.id) is None
