from unittest.mock import MagicMock
import httpx
import pytest
from httpx import AsyncClient, ASGITransport

from nodetool.api.server import create_app
from nodetool.common.nodetool_api_client import NodetoolAPIClient
from nodetool.metadata.types import ImageRef
from nodetool.models.asset import Asset
from nodetool.models.user import User


@pytest.fixture
def async_client():
    host, port = "127.0.0.1", "9000"
    return AsyncClient(transport=ASGITransport(app=create_app(), client=(host, port)))  # type: ignore


@pytest.fixture
def nodetool_client(async_client: httpx.AsyncClient, user: User):
    assert user.auth_token
    return NodetoolAPIClient(
        user_id=user.id,
        auth_token=user.auth_token,
        base_url="http://127.0.0.1:9000",
        client=async_client,
    )


@pytest.mark.asyncio
async def test_get(async_client: AsyncClient):
    resp = await async_client.get("http://127.0.0.1:9000/docs")

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_metadata(nodetool_client: NodetoolAPIClient):
    response = await nodetool_client.get("api/nodes/metadata")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_asset(nodetool_client: NodetoolAPIClient, image: Asset):
    response = await nodetool_client.get("/api/assets/" + image.id)
    assert response.status_code == 200
