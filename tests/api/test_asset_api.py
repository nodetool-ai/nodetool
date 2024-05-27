import json
import os
from fastapi.testclient import TestClient
import pytest
from nodetool.common.environment import Environment
from nodetool.models.asset import Asset
from nodetool.models.user import User
from tests.conftest import make_image


test_mp4 = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.mp4")
test_jpg = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.jpg")


def test_index(client: TestClient, headers: dict[str, str], user: User):
    image = make_image(user)
    response = client.get("/api/assets", headers=headers)
    json = response.json()
    assert response.status_code == 200
    assert len(json["assets"]) == 1
    assert json["assets"][0]["id"] == image.id


@pytest.mark.asyncio
async def test_delete(client: TestClient, headers: dict[str, str], user: User):
    image = make_image(user)
    response = client.delete(f"/api/assets/{image.id}", headers=headers)
    assert response.status_code == 200
    assert Asset.find(user.id, image.id) is None
    assert not await Environment.get_asset_storage().file_exists(image.file_name)


def test_pagination(client: TestClient, headers: dict[str, str], user: User):
    for _ in range(5):
        make_image(user)
    response = client.get("/api/assets", headers=headers, params={"page_size": 3})
    assert response.status_code == 200
    assert len(response.json()["assets"]) == 3
    next_cursor = response.json()["next"]
    response = client.get(
        f"/api/assets", params={"cursor": next_cursor, "page_size": 3}, headers=headers
    )
    assert response.status_code == 200
    assert len(response.json()["assets"]) == 2
    assert response.json()["next"] == ""


def test_get(client: TestClient, headers: dict[str, str], user: User):
    image = make_image(user)
    response = client.get(f"/api/assets/{image.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == image.id


def test_put(client: TestClient, headers: dict[str, str], user: User):
    image = make_image(user)
    response = client.put(
        f"/api/assets/{image.id}",
        json={
            "parent_id": user.id,
            "status": "processed",
            "name": "bild.jpeg",
            "content_type": "image/jpeg",
        },
        headers=headers,
    )
    assert response.status_code == 200
    image = Asset.find(user.id, image.id)
    assert image is not None
    assert image.status == "processed"


def test_create(client: TestClient, headers: dict[str, str], user: User):
    response = client.post(
        "/api/assets",
        files={"file": ("test.jpg", open(test_jpg, "rb"), "image/jpeg")},
        data={
            "json": json.dumps(
                {
                    "parent_id": user.id,
                    "status": "processed",
                    "name": "bild.jpeg",
                    "content_type": "image/jpeg",
                }
            )
        },
        headers=headers,
    )
    assert response.status_code == 200
    image = Asset.find(user.id, response.json()["id"])
    assert image is not None
    assert image.name == "bild.jpeg"
