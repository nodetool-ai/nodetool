from typing import Any
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from nodetool.api.server import create_app
from nodetool.api.types.graph import Node, Edge
from nodetool.common.environment import Environment
from nodetool.models.message import Message
from nodetool.models.thread import Thread
from nodetool.models.user import User
from nodetool.models.workflow import Workflow
from nodetool.models.job import Job
from nodetool.models.asset import Asset
from nodetool.models.schema import create_all_tables, drop_all_tables
import PIL.ImageChops
from nodetool.workflows.processing_context import ProcessingContext
from datetime import datetime, timedelta
import io
import uuid
import PIL.Image


@pytest.fixture(autouse=True, scope="function")
def setup_and_teardown():
    Environment.set_remote_auth(True)

    Environment.settings = {
        "ENV": "test",
        "DB_PATH": "/tmp/nodetool_test.db",
    }
    create_all_tables()

    yield

    drop_all_tables()


def pil_to_bytes(image: PIL.Image.Image, format="PNG") -> bytes:
    """
    Convert a PIL.Image.Image to bytes.

    Args:
        image (PIL.Image.Image): The image to convert.
        format (str, optional): The format to use. Defaults to "PNG".

    Returns:
        bytes: The image as bytes.
    """
    with io.BytesIO() as buffer:
        image.save(buffer, format=format)
        return buffer.getvalue()


def make_user(verified: bool = False) -> User:
    user = User(
        id="1",
        email=uuid.uuid4().hex + "@a.de",
        auth_token=uuid.uuid4().hex,
        token_valid=datetime.now() + timedelta(days=1),
        passcode="123",
        passcode_valid=datetime.now() + timedelta(days=1),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        verified_at=datetime.now() if verified else None,
    )
    user.save()
    return user


def upload_test_image(image: Asset, width: int = 512, height: int = 512):
    storage = Environment.get_asset_storage()
    img = PIL.Image.new("RGB", (width, height))
    storage.upload(image.file_name, io.BytesIO(pil_to_bytes(img)))


def make_image(
    user: User,
    workflow_id: str | None = None,
    parent_id: str | None = None,
    width: int = 512,
    height: int = 512,
) -> Asset:
    image = Asset.create(
        user_id=user.id,
        name="test_image",
        parent_id=parent_id,
        content_type="image/jpeg",
        workflow_id=workflow_id,
    )
    upload_test_image(image, width, height)
    return image


def make_job(user: User, **kwargs):
    return Job.create(
        workflow_id=str(uuid.uuid4()),
        user_id=user.id,
        **kwargs,
    )


@pytest.fixture()
def image(user: User):
    return make_image(user)


@pytest.fixture()
def user():
    return User(
        id="1",
        email="test@a.de",
        auth_token="token",
        token_valid=datetime.now() + timedelta(days=1),
        passcode="123",
        passcode_valid=datetime.now() + timedelta(days=1),
        created_at=datetime.now(),
        updated_at=datetime.now(),
        verified_at=datetime.now(),
    ).save()


@pytest.fixture()
def context(user: User):
    workflow = Workflow.create(user.id, "wf", {"edges": [], "nodes": []})
    assert user.auth_token
    return ProcessingContext(
        user_id=user.id, workflow_id=workflow.id, auth_token=user.auth_token
    )


@pytest.fixture()
def client():
    """
    Create a test client for the FastAPI app.

    This fixture is scoped to the module, so it will only be created once for the entire test run.
    """

    return TestClient(create_app())


@pytest.fixture()
def headers(user: User):
    """
    Create headers for a http request that requires authentication.

    This fixture is scoped to the function, so it will be created once for each test function.
    """
    return {"Authorization": f"Bearer {user.auth_token}"}


def make_node(id, type: str, data: dict[str, Any]):
    return Node(id=id, type=type, data=data)


@pytest.fixture()
def thread(user: User):
    yield Thread.create(
        user_id=user.id,
    )


@pytest.fixture()
def message(user: User, thread: Thread):
    yield Message.create(
        user_id=user.id,
        thread_id=thread.id,
        role="user",
        content="content",
    )


@pytest.fixture()
def workflow(user: User):
    nodes = [
        make_node("1", "nodetool.input.FloatInput", {"name": "in1", "value": 10}),
        make_node("2", "nodetool.math.Add", {"b": 1}),
    ]
    edges = [
        Edge(
            source=nodes[0].id,
            target=nodes[1].id,
            sourceHandle="output",
            targetHandle="a",
        ),
    ]

    yield Workflow.create(
        user_id=user.id,
        name="Test Workflow",
        graph={
            "nodes": [node.model_dump() for node in nodes],
            "edges": [edge.model_dump() for edge in edges],
        },
    )
