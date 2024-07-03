from fastapi.testclient import TestClient
from nodetool.types.workflow import WorkflowRequest
from nodetool.types.graph import Edge, Graph as APIGraph, Node
from nodetool.types.chat import MessageList
from nodetool.metadata.types import Message as APIMessage
from nodetool.models.message import Message
from nodetool.models.thread import Thread
from nodetool.models.user import User


def test_create_message(
    client: TestClient, thread: Thread, headers: dict[str, str], user: User
):
    message = APIMessage(thread_id=thread.id, role="user", content="Hello")
    json = message.model_dump()
    response = client.post("/api/messages/", json=json, headers=headers)
    assert response.status_code == 200

    m = Message.get(response.json()["id"])
    assert m is not None
    assert m.content == "Hello"


def test_create_message_no_thread(
    client: TestClient, headers: dict[str, str], user: User
):
    message = APIMessage(role="user", content="Hello")
    json = message.model_dump()
    response = client.post("/api/messages/", json=json, headers=headers)
    assert response.status_code == 200

    m = Message.get(response.json()["id"])
    assert m is not None
    assert m.content == "Hello"
    assert m.thread_id is not None


def test_get_messages(
    client: TestClient, message: Message, thread: Thread, headers: dict[str, str]
):
    response = client.get(
        "/api/messages/",
        headers=headers,
        params={"thread_id": thread.id, "reverse": "0"},
    )
    assert response.status_code == 200
    message_list = MessageList(**response.json())
    assert len(message_list.messages) == 1
    assert message_list.messages[0].id == message.id


def test_get_messages_reverse(
    client: TestClient, message: Message, thread: Thread, headers: dict[str, str]
):
    # create second message
    last_message = Message.create(
        user_id=message.user_id,
        thread_id=message.thread_id,
        role="user",
        content="Last",
    )
    response = client.get(
        "/api/messages/",
        headers=headers,
        params={"thread_id": thread.id, "reverse": "1"},
    )
    assert response.status_code == 200
    message_list = MessageList(**response.json())
    assert len(message_list.messages) == 2
    assert message_list.messages[0].id == last_message.id
    assert message_list.messages[1].id == message.id
